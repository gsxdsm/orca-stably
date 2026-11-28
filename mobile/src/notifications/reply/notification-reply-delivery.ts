import { loadHosts } from '../../host-catalog/host-store'
import { openHostLogicalClient } from '../../transport/connection/host-logical-client'
import { resolveHostIdForFingerprint } from '../payload-identity/push-host-fingerprint'
import { readOrcaPushPayload } from '../payload-identity/push-payload'
import { sendMobileStructuredAgentSessionMessage } from '../../session/native-chat/agent-session/mobile-structured-agent-session-send'
import { sendMobileNativeChatMessageWithOutcome } from '../../session/native-chat/composer/delivery/mobile-native-chat-send'
import { buildNativeChatPasteBytes } from '../../../../src/shared/native-chat/input/composer/native-chat-paste-bytes'
import { scopeRpcClientToExecutionHost } from '../../worktree/execution-hosts/execution-host-scoped-rpc-client'
import { parseExecutionHostId } from '../../../../src/shared/execution-host/execution-host'
import { itemComment } from '../../bots/items/bot-item-operations'
import { nativeChatTerminalDraftRead } from '../../terminal/session/mobile-session-terminal-operations'

export async function sendNotificationReply(
  data: unknown,
  text: string,
  operationId: string
): Promise<void> {
  const payload = readOrcaPushPayload(data)
  if (
    !payload?.replyTarget ||
    !payload.worktreeId ||
    !payload.paneKey ||
    payload.kind === 'dismiss'
  ) {
    throw new Error('This notification has no chat')
  }
  if (!text.trim() || text.length > 32_000) {
    throw new Error('Reply is empty or too long')
  }
  const hosts = await loadHosts()
  const hostId = resolveHostIdForFingerprint(payload.hostFingerprint, hosts)
  const host = hosts.find((candidate) => candidate.id === hostId)
  if (!host) {
    throw new Error('Host is not paired or credentials are unavailable')
  }
  const pairedClient = openHostLogicalClient(host, () => {}, { backgroundSend: true })
  const executionHost = parseExecutionHostId(payload.executionHost)
  const client =
    executionHost?.kind === 'runtime'
      ? scopeRpcClientToExecutionHost(pairedClient, executionHost.id)
      : pairedClient
  const deadline = Date.now() + 20_000
  try {
    let reason = 'Host refused the reply'
    const target = payload.replyTarget
    if (target.type === 'bot-item') {
      itemComment.interpret(
        await itemComment.request(
          client,
          { item: target.itemUid, text, requestId: operationId },
          { timeoutMs: deadline - Date.now(), budgetSpansConnect: true }
        )
      )
      return
    }
    if (target.type === 'terminal') {
      const read = nativeChatTerminalDraftRead.interpret(
        await nativeChatTerminalDraftRead.request(
          client,
          {
            terminal: target.terminal,
            expectedIncarnationId: target.expectedIncarnationId,
            screen: true,
            limit: 1
          },
          { timeoutMs: deadline - Date.now(), budgetSpansConnect: true }
        )
      )
      if (
        !read.accepted ||
        read.value.terminal?.draft === undefined ||
        read.value.terminal.draft.trim()
      ) {
        throw new Error('The chat has an existing draft or its input could not be checked')
      }
    }
    const outcome =
      target.type === 'chat'
        ? await sendMobileStructuredAgentSessionMessage({
            client,
            sessionId: target.sessionId,
            expectedRuntimeFence: 0,
            text,
            attachments: [],
            clientMessageId: operationId,
            deadline,
            onError: (message) => {
              reason = message
            }
          })
        : await sendMobileNativeChatMessageWithOutcome({
            client,
            terminal: target.terminal,
            text: buildNativeChatPasteBytes(text),
            expectedIncarnationId: target.expectedIncarnationId,
            mobileClient: { id: host.deviceToken, type: 'mobile' },
            deadline,
            requireWriteSettlement: true
          })
    if (outcome === 'unknown') {
      throw new Error('Delivery unconfirmed; check the chat before sending again')
    }
    if (outcome !== 'accepted' && outcome !== 'queued') {
      throw new Error(reason)
    }
  } finally {
    pairedClient.close()
  }
}
