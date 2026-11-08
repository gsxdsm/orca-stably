/* eslint-disable max-lines -- Why: send, hold and hand-back share one hook so unconfirmed-send ordering stays one behavior surface. */
import { useCallback, type MutableRefObject } from 'react'
import type { RpcClient } from '../../../transport/rpc-client'
import {
  clearMobileNativeChatInput,
  openMobileNativeChatSendBudget,
  readMobileNativeChatInputClear,
  sendMobileNativeChatMessageWithOutcome,
  typeMobileNativeChatCommandWithOutcome,
  type MobileNativeChatSendIntent,
  type MobileNativeChatSendOutcome
} from '../mobile-native-chat-send'
import type { CatalogCommandDelivery } from '../../../../../src/shared/agent-session/options/agent-session-option-catalog-types'
import { isSlashCommandDraft } from '../../../../../src/shared/native-chat/input/native-chat-slash-commands'
import { healMobileNativeChatStaleInput } from '../mobile-native-chat-stale-input'
import { classifyMobileNativeChatSend } from '../mobile-native-chat-send-classification'
import { readMobileNativeChatSkillOrigin } from '../composer/mobile-native-chat-draft-store'
import { nativeChatSendTextOwner } from './mobile-native-chat-send-text-owner'
import {
  beginMobileNativeChatInFlightSend,
  settleMobileNativeChatInFlightSend
} from '../composer/mobile-native-chat-in-flight-sends'
import {
  acquireMobileNativeChatTerminalWrite,
  releaseMobileNativeChatTerminalWrite
} from '../mobile-native-chat-terminal-write-lock'
import {
  discardOptimisticMobileNativeChatSend,
  type MobileNativeChatSendOrigin
} from '../mobile-native-chat-pending-echo'
import type { MobileNativeChatLaunchDraftSeed } from '../composer/use-mobile-native-chat-launch-draft-seed'
import { buildNativeChatPasteBytes } from '../../../../../src/shared/native-chat/input/native-chat-paste-bytes'
import {
  UNCONFIRMED_SEND_MESSAGE,
  UNCONFIRMED_SEND_RESTORED_MESSAGE
} from '../use-mobile-native-chat-unconfirmed-sends'
import { retryHeldHermesSubmit } from '../mobile-hermes-held-submit'
import { projectMobileCrewMentions } from '../../orchestration-crew/mobile-orchestration-crew'

export type MobileNativeChatMessageSend = {
  send: (text: string, images?: string[]) => Promise<boolean>
  // Preserve unknown for callers healing pre-pasted input; spend their existing action deadline across paste and text.
  sendWithOutcome: (
    text: string,
    images?: string[],
    deadline?: number,
    // Only a structured send carries them; a terminal chat's images were pasted before this.
    _attachments?: readonly unknown[],
    sentAt?: number,
    intent?: MobileNativeChatSendIntent
  ) => Promise<MobileNativeChatSendOutcome>
  dispatchCommand: (
    text: string,
    options?: { delivery?: CatalogCommandDelivery }
  ) => Promise<MobileNativeChatSendOutcome>
}

export function useMobileNativeChatMessageSend(args: {
  client: RpcClient | null
  enabled: boolean
  handleRef: MutableRefObject<string | null>
  deviceTokenRef: MutableRefObject<string | null>
  agentRef: MutableRefObject<string | null>
  // Capture control-send scope before await so later tab switches cannot record options on the wrong tab.
  commandSendRef: MutableRefObject<(command: string) => void>
  captureSendOrigin: (text: string, sentAt?: number) => MobileNativeChatSendOrigin | null
  readSeededLaunchDraftSeed: () => MobileNativeChatLaunchDraftSeed | null
  clearDraftForSend: (origin: MobileNativeChatSendOrigin, text: string) => void
  restoreRejectedDraft: (
    origin: MobileNativeChatSendOrigin,
    text: string,
    options?: { preserveConversationCommands?: boolean }
  ) => void
  acceptSend: (
    origin: MobileNativeChatSendOrigin,
    text: string,
    images?: string[],
    allowWaiting?: boolean
  ) => string | void
  discardPendingSend?: (id: string) => void
  holdUnconfirmedSend: (
    origin: MobileNativeChatSendOrigin,
    text: string,
    onUnconfirmed: () => void,
    inFlightId?: string | null
  ) => void
  onSendError: (message: string) => void
}): MobileNativeChatMessageSend {
  const {
    client,
    enabled,
    handleRef,
    deviceTokenRef,
    agentRef,
    commandSendRef,
    captureSendOrigin,
    readSeededLaunchDraftSeed,
    clearDraftForSend,
    restoreRejectedDraft,
    acceptSend,
    discardPendingSend,
    holdUnconfirmedSend,
    onSendError
  } = args

  const sendMessage = useCallback(
    async (
      draftText: string,
      images: string[] | undefined,
      syncComposer: boolean,
      recordControlSend: boolean,
      sharedDeadline?: number,
      sentAt?: number,
      intent?: MobileNativeChatSendIntent
    ): Promise<MobileNativeChatSendOutcome> => {
      // Trim only outgoing bytes to prevent rapid-send concatenation; restore the exact typed draft on rejection.
      const text = draftText.trimEnd()
      const wireText = projectMobileCrewMentions(text)
      const handle = handleRef.current
      const origin = captureSendOrigin(wireText, sentAt)
      const agent = agentRef.current
      const recordCommand = commandSendRef.current
      // Connection drops precede lease collapse by one render; gate immediately to avoid waiting the whole send budget.
      if (!client || !handle || !origin || !enabled) {
        onSendError('Message not sent (disconnected)')
        return 'rejected'
      }
      const owner = nativeChatSendTextOwner(intent, syncComposer ? restoreRejectedDraft : null)
      const skillOrigin = owner.skillOrigin ?? readMobileNativeChatSkillOrigin(origin.draftKey)
      const classification = classifyMobileNativeChatSend(agent, text, skillOrigin)
      const optimisticId =
        agent === 'hermes' && classification === 'chat'
          ? acceptSend(origin, wireText, images, true)
          : undefined
      // Heal orphaned input before clearing draft; failed heals preserve typing, and heal/text spend the same action deadline.
      const deadline = sharedDeadline ?? openMobileNativeChatSendBudget(agent)
      const healArgs = {
        client,
        terminal: handle,
        deviceToken: deviceTokenRef.current,
        deadline
      }
      let inFlightId: string | null = null
      const reject = (restoreDraft: boolean): 'rejected' => {
        settleMobileNativeChatInFlightSend(inFlightId)
        discardOptimisticMobileNativeChatSend(optimisticId, discardPendingSend)
        if (restoreDraft && syncComposer) {
          restoreRejectedDraft(origin, draftText)
        }
        onSendError('Message not sent')
        return 'rejected'
      }
      if (!(await healMobileNativeChatStaleInput(healArgs))) {
        return reject(false)
      }
      // A picked skill leading the draft is chat, as on desktop; read it before the clear forgets it.
      // Clear optimistically before slow/lost acknowledgements; only definite rejection restores the draft.
      if (syncComposer) {
        clearDraftForSend(origin, draftText)
      }
      const seededLaunchDraft = readSeededLaunchDraftSeed()
      // Saved in the same write as the clear, so a kill before the outcome cannot lose the text.
      inFlightId = owner.owned
        ? beginMobileNativeChatInFlightSend(origin, 'terminal', draftText, {
            command: classification !== 'chat',
            intent
          })
        : null
      const typesCodexCommand =
        agent === 'codex' &&
        classification !== 'chat' &&
        isSlashCommandDraft(text) &&
        !images?.length
      if (!images?.length) {
        const clearInput = await readMobileNativeChatInputClear({
          client,
          terminal: handle,
          deadline,
          ...(seededLaunchDraft ? { seededText: seededLaunchDraft.text } : {})
        })
        const cleared = await clearMobileNativeChatInput({
          client,
          terminal: handle,
          clearInput,
          deadline,
          ...(deviceTokenRef.current
            ? { mobileClient: { id: deviceTokenRef.current, type: 'mobile' } }
            : {})
        })
        if (!cleared) {
          return reject(true)
        }
      }
      const mobileClient = deviceTokenRef.current
        ? { id: deviceTokenRef.current, type: 'mobile' as const }
        : undefined
      const resolvedLaunchDraft =
        syncComposer && typeof seededLaunchDraft?.createdAt === 'number'
          ? { text: seededLaunchDraft.text, createdAt: seededLaunchDraft.createdAt }
          : undefined
      const outcome = typesCodexCommand
        ? await typeMobileNativeChatCommandWithOutcome({
            client,
            terminal: handle,
            command: text,
            ...(resolvedLaunchDraft ? { resolvedLaunchDraft } : {}),
            ...(mobileClient ? { mobileClient } : {}),
            deadline
          })
        : await sendMobileNativeChatMessageWithOutcome({
            client,
            terminal: handle,
            text: buildNativeChatPasteBytes(wireText),
            ...(resolvedLaunchDraft ? { resolvedLaunchDraft } : {}),
            deadline,
            ...(mobileClient ? { mobileClient } : {})
          })
      if (outcome === 'unknown') {
        if (classification === 'chat') {
          // Lost acknowledgement proves no failure; wait for the transcript, then hand back text it never showed.
          holdUnconfirmedSend(
            origin,
            wireText,
            () => {
              // A TUI holds a mid-turn send with no transcript row until the turn ends, so its absence proves nothing.
              if (!owner.owned || origin.queuedDuringWorkingEpoch !== undefined) {
                onSendError(UNCONFIRMED_SEND_MESSAGE)
                return
              }
              owner.giveBack(origin, draftText)
              onSendError(UNCONFIRMED_SEND_RESTORED_MESSAGE)
            },
            inFlightId
          )
        } else {
          owner.giveBack(origin, draftText, { preserveConversationCommands: true })
          settleMobileNativeChatInFlightSend(inFlightId, 'sent')
          onSendError(UNCONFIRMED_SEND_MESSAGE)
        }
        return 'unknown'
      }
      settleMobileNativeChatInFlightSend(inFlightId, outcome === 'rejected' ? 'kept' : 'sent')
      if (outcome === 'rejected') {
        return reject(true)
      }
      if (agent === 'hermes' && classification === 'chat') {
        await retryHeldHermesSubmit({
          client,
          terminal: handle,
          text: wireText,
          deadline,
          deviceToken: deviceTokenRef.current,
          isCurrent: () => handleRef.current === handle && agentRef.current === 'hermes'
        })
      }
      if (classification === 'chat') {
        if (!optimisticId) {
          acceptSend(origin, wireText, images)
        }
      } else if (recordControlSend) {
        // The session-option catalog can recognize controls omitted from the
        // autocomplete catalog (for example Claude `/model` and `/fast`).
        recordCommand(text.trim())
      }
      return 'accepted'
    },
    [
      acceptSend,
      agentRef,
      captureSendOrigin,
      clearDraftForSend,
      client,
      commandSendRef,
      deviceTokenRef,
      discardPendingSend,
      enabled,
      handleRef,
      holdUnconfirmedSend,
      onSendError,
      readSeededLaunchDraftSeed,
      restoreRejectedDraft
    ]
  )

  const sendWithOutcome = useCallback(
    (
      text: string,
      images?: string[],
      deadline?: number,
      _attachments?: readonly unknown[],
      sentAt?: number,
      intent?: MobileNativeChatSendIntent
    ) => sendMessage(text, images, !intent?.queued, true, deadline, sentAt, intent),
    [sendMessage]
  )

  const send = useCallback(
    async (text: string, images?: string[]): Promise<boolean> =>
      (await sendWithOutcome(text, images)) !== 'rejected',
    [sendWithOutcome]
  )

  // Lock option commands against send body/Enter spacing or they can become part of the user prompt.
  const dispatchCommand = useCallback(
    async (
      text: string,
      _options?: { delivery?: CatalogCommandDelivery }
    ): Promise<MobileNativeChatSendOutcome> => {
      const terminal = handleRef.current
      if (terminal && !acquireMobileNativeChatTerminalWrite(terminal)) {
        return 'rejected'
      }
      try {
        if (agentRef.current === 'codex') {
          if (!client || !terminal || !enabled) {
            return 'rejected'
          }
          const deadline = openMobileNativeChatSendBudget()
          const mobileClient = deviceTokenRef.current
            ? { id: deviceTokenRef.current, type: 'mobile' as const }
            : undefined
          if (
            !(await healMobileNativeChatStaleInput({
              client,
              terminal,
              deviceToken: deviceTokenRef.current,
              deadline
            }))
          ) {
            return 'rejected'
          }
          return typeMobileNativeChatCommandWithOutcome({
            client,
            terminal,
            command: text,
            ...(mobileClient ? { mobileClient } : {}),
            deadline
          })
        }
        return await sendMessage(text, undefined, false, false)
      } finally {
        if (terminal) {
          releaseMobileNativeChatTerminalWrite(terminal)
        }
      }
    },
    [client, deviceTokenRef, enabled, handleRef, sendMessage]
  )

  return { send, sendWithOutcome, dispatchCommand }
}
