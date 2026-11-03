import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RpcClient } from '../../transport/rpc-client'
import { randomV4Uuid } from '../../platform/random-v4-uuid'
import {
  NativeChatTerminalQueueSnapshotSchema,
  sameNativeChatTerminalQueueSnapshot,
  type NativeChatTerminalQueueSnapshot,
  type NativeChatTerminalQueueRequest
} from '../../../../src/shared/native-chat/native-chat-terminal-queue'
import type { MobileStructuredQueuedMessageControls } from '../use-mobile-structured-queued-message-controls'
import { mobileQueuedMessageCards } from '../mobile-structured-queued-message-cards'
import type { z } from 'zod'
import { NATIVE_CHAT_TERMINAL_QUEUE_CAPABILITY } from '../../../../src/shared/native-chat/native-chat-terminal-queue-capability'
import { mobileTerminalChatQueueSend } from './mobile-terminal-chat-queue-send'
import type { MobileNativeChatSendOutcome } from './mobile-native-chat-send'
import { isRpcDeliveryUnknown } from '../../transport/rpc-delivery-ambiguity'
import { isLogicalClientCutoverError } from '../../transport/stable-logical-rpc-client'
import { UNCONFIRMED_SEND_MESSAGE } from './use-mobile-native-chat-unconfirmed-sends'

export function useMobileTerminalChatQueue(args: {
  client: RpcClient | null
  terminal: string | null
  enabled: boolean
  hostCapabilities?: readonly string[] | null
  appendText: (text: string) => boolean
  onSendError?: (message: string) => void
}) {
  const { client, terminal, appendText } = args
  const enabled =
    args.enabled && args.hostCapabilities?.includes(NATIVE_CHAT_TERMINAL_QUEUE_CAPABILITY) === true
  const [held, setHeld] = useState<{
    terminal: string
    snapshot: NativeChatTerminalQueueSnapshot
  } | null>(null)
  const scope = `${terminal ?? ''}:${enabled}`
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const tail = useRef<Promise<unknown>>(Promise.resolve())
  const request = useCallback(
    (action: z.infer<typeof NativeChatTerminalQueueRequest>['action']) => {
      const run = async () => {
        if (!client || !terminal || !enabled || scopeRef.current !== scope) {
          return null
        }
        const response = await client.sendRequest(
          'nativeChat.terminalQueue',
          { terminal, action },
          { timeoutMs: 5_000 }
        )
        if (!response.ok) {
          return null
        }
        const parsed = NativeChatTerminalQueueSnapshotSchema.safeParse(response.result)
        if (!parsed.success) {
          return null
        }
        if (scopeRef.current === scope) {
          setHeld((previous) =>
            previous?.terminal === terminal &&
            sameNativeChatTerminalQueueSnapshot(previous.snapshot, parsed.data)
              ? previous
              : { terminal, snapshot: parsed.data }
          )
        }
        return parsed.data
      }
      const result = tail.current.catch(() => null).then(run)
      tail.current = result
      return result
    },
    [client, terminal, enabled, scope]
  )
  useEffect(() => {
    if (!enabled) {
      return
    }
    let reading = false
    const poll = async () => {
      if (reading) {
        return
      }
      reading = true
      try {
        await request({ type: 'read' })
      } catch {
        /* Reconnect retries the read. */
      }
      reading = false
    }
    void poll()
    const timer = setInterval(() => void poll(), 1_000)
    return () => clearInterval(timer)
  }, [enabled, request])
  const snapshot = enabled && held?.terminal === terminal ? held.snapshot : null
  const enqueue = useCallback(
    async (text: string): Promise<MobileNativeChatSendOutcome> => {
      try {
        return (await request({ type: 'enqueue', messageId: randomV4Uuid(), text })) !== null
          ? 'queued'
          : 'rejected'
      } catch (error) {
        const unknown = isRpcDeliveryUnknown(error) || isLogicalClientCutoverError(error)
        args.onSendError?.(unknown ? UNCONFIRMED_SEND_MESSAGE : 'Message not sent')
        return unknown ? 'unknown' : 'rejected'
      }
    },
    [request, args.onSendError]
  )
  const controls = useMemo<MobileStructuredQueuedMessageControls>(
    () => ({
      sessionKey: scope,
      cards: mobileQueuedMessageCards(snapshot?.queuedMessages, [], {
        agentWorking: snapshot?.activity.state === 'working'
      }).map((card) => ({ ...card, waitsForAgent: true })),
      pause: null,
      send: async () => false,
      delete: async (messageId) =>
        (await request({ type: 'delete', messageIds: [messageId] })) !== null,
      clear: async (messageIds) => (await request({ type: 'delete', messageIds })) !== null,
      edit: async (messageId, onCopied) => {
        const held = await request({ type: 'edit', messageId })
        const card = held?.queuedMessages.find(
          (item) => item.messageId === messageId && item.paused
        )
        if (
          !card ||
          !appendText(
            card.body.blocks
              .flatMap((block) => (block.type === 'text' ? [block.text] : []))
              .join('\n')
          )
        ) {
          return false
        }
        onCopied?.()
        return (await request({ type: 'delete', messageIds: [messageId] })) !== null
      },
      resume: async () => false
    }),
    [scope, snapshot, request, appendText]
  )
  const bindSend = (
    ...args: [
      Parameters<typeof mobileTerminalChatQueueSend>[1],
      Parameters<typeof mobileTerminalChatQueueSend>[2],
      Parameters<typeof mobileTerminalChatQueueSend>[3]
    ]
  ) => mobileTerminalChatQueueSend(enqueue, ...args)
  return {
    enabled,
    activity: snapshot?.activity,
    controls,
    enqueue,
    bindSend,
    sendFollowUp: enabled ? { action: 'queue' as const, offersChoice: false } : null
  }
}
