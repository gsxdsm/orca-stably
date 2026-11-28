import * as z from 'zod'
import type { AgentSessionHistoryResult } from '../../../src/shared/agent-session/agent-session-wire'
import { agentJournalSubmissionKey } from '../../../src/shared/agent-session/journal/agent-session-journal-item-key'
import { isRootAgentJournalItem } from '../../../src/shared/agent-session/journal/agent-session-journal-producer'
import { latestNativeChatOrcaStopCut } from '../../../src/shared/native-chat/transcript/continuation/native-chat-orca-stop-cut'
import { projectStructuredItemToNativeChat } from '../../../src/shared/agent-session/view/structured-agent-session-projection'
import { agentMessageTranscriptText } from '../../../src/shared/agent-session/view/messages/agent-message-display-text'
import type { NativeChatMessage } from '../../../src/shared/native-chat/native-chat-types'
import type { NativeChatTranscriptPage } from '../../../src/shared/native-chat/transcript/streaming/native-chat-transcript-frames'
import { readBotItem } from '../bots/items/bot-item-operations'
import { nativeChatSessionPageRead } from '../session/native-chat/agent-session/mobile-native-chat-page-read-operations'
import { callAgentSession } from '../session/native-chat/agent-session/mobile-structured-agent-session-rpc'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { WatchThreadMessage, WatchThreadPage } from './watch-contract'
import type { WatchThreadTarget } from './watch-gateway'
import { clipWatchText } from './watch-snapshot'
import { resolveWatchTerminalTranscript } from './watch-terminal-send'

const PAGE_SIZE = 8
const TEXT_LIMIT = 1800
const PAGE_BYTE_LIMIT = 24 * 1024
const READ_TIMEOUT = 5_000
const journalCursor = z.object({
  epoch: z.string().min(1).max(256),
  sequence: z.int().nonnegative()
})
const transcriptCursor = z.object({
  sessionId: z.string(),
  offset: z.int().positive()
})

function bubble(
  id: string,
  role: WatchThreadMessage['role'],
  text: string,
  at: number | null,
  shortened = false
): WatchThreadMessage[] {
  const bounded = clipWatchText(text, TEXT_LIMIT)
  return bounded
    ? [
        {
          id: id.slice(0, 768),
          role,
          text: bounded,
          ...(typeof at === 'number' && Number.isSafeInteger(at) && at >= 0 ? { at } : {}),
          ...(shortened || bounded.length < text.trim().length ? { shortened: true } : {})
        }
      ]
    : []
}

function project(message: NativeChatMessage, id = message.id): WatchThreadMessage[] {
  if (message.role !== 'user' && message.role !== 'assistant') {
    return []
  }
  return bubble(
    id,
    message.role === 'user' ? 'user' : 'agent',
    agentMessageTranscriptText(message.blocks, message.from),
    message.timestamp,
    message.shortened
  )
}

export function boundWatchThreadPage(page: WatchThreadPage): WatchThreadPage | null {
  const encoder = new TextEncoder()
  const maxMessageBytes = Math.floor((PAGE_BYTE_LIMIT - 512) / Math.max(1, page.messages.length))
  const messages = page.messages.map((message) => {
    let length = message.text.length
    let next = message
    while (encoder.encode(JSON.stringify(next)).byteLength > maxMessageBytes && length > 1) {
      length = Math.floor(length / 2)
      next = { ...message, text: clipWatchText(message.text, length) ?? '…', shortened: true }
    }
    return next
  })
  const bounded = { ...page, messages }
  return encoder.encode(JSON.stringify(bounded)).byteLength <= PAGE_BYTE_LIMIT ? bounded : null
}

export async function readWatchThreadHistory(
  client: RpcClient,
  target: WatchThreadTarget,
  before?: string
): Promise<WatchThreadPage | null> {
  if (target.kind === 'item') {
    const result = await readBotItem(client, target.id, {
      newest: true,
      ...(before ? { before } : {})
    })
    if (result.kind !== 'read' || result.value.item.uid !== target.id) {
      return null
    }
    const { item, events, earlierCursor } = result.value
    const page = events.slice(-PAGE_SIZE)
    const next = events.length > PAGE_SIZE ? page[0]?.id : earlierCursor
    const messages = page.flatMap((event) =>
      event.kind === 'commented' && typeof event.data.text === 'string'
        ? bubble(
            event.id,
            event.actor.kind === 'owner' ? 'user' : 'agent',
            event.data.text,
            event.at
          )
        : []
    )
    if (!next && item.description) {
      messages.unshift(
        ...bubble(`description:${item.uid}`, 'agent', item.description, item.createdAt)
      )
    }
    return { messages, ...(next ? { before: next } : {}) }
  }
  if (target.kind === 'term') {
    const live =
      !target.providerSession && target.workspaceId
        ? await resolveWatchTerminalTranscript(client, target.workspaceId, target.id)
        : null
    const session = target.providerSession ?? live?.providerSession
    const agent = live?.agentType ?? target.agent
    if (!session || !agent) {
      return { messages: [], generation: 'terminal:empty' }
    }
    const cursor = before ? transcriptCursor.parse(JSON.parse(before)) : undefined
    const sameSession = !cursor || cursor.sessionId === session.id
    const offset = sameSession ? cursor?.offset : undefined
    const reply = nativeChatSessionPageRead.interpret(
      await nativeChatSessionPageRead.request(
        client,
        {
          agent,
          sessionId: session.id,
          ...(session.transcriptPath ? { transcriptPath: session.transcriptPath } : {}),
          ...(offset === undefined ? {} : { beforeOffset: offset }),
          limit: PAGE_SIZE,
          capabilities: { transcriptSourceOrder: 1 }
        },
        { timeoutMs: READ_TIMEOUT, budgetSpansConnect: true }
      )
    )
    if (!reply.accepted || !reply.value || typeof reply.value !== 'object') {
      return null
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: nativeChat.readSession serializes its transcript page directly and the messages check below rejects refusal envelopes.
    const page = reply.value as Partial<NativeChatTranscriptPage>
    if (!Array.isArray(page.messages)) {
      return null
    }
    return {
      messages: page.messages.slice(-PAGE_SIZE).flatMap((message) => project(message)),
      generation: `terminal:${session.id}`,
      ...(!sameSession ? { reset: true } : {}),
      ...(page.hasMore && page.beforeOffset && page.beforeOffset !== offset
        ? { before: JSON.stringify({ sessionId: session.id, offset: page.beforeOffset }) }
        : {})
    }
  }
  const cursor = before ? journalCursor.parse(JSON.parse(before)) : undefined
  const result = await callAgentSession<AgentSessionHistoryResult>(
    client,
    'agentSession.history',
    { sessionId: target.id, direction: cursor ? 'before' : 'tail', cursor, limit: 24 },
    READ_TIMEOUT
  )
  const page = result.page
  if (page.sessionId !== target.id) {
    return null
  }
  const submitted = new Map(
    page.submissions.flatMap(({ providerItemId, clientMessageId }) =>
      providerItemId ? [[providerItemId, agentJournalSubmissionKey(clientMessageId)] as const] : []
    )
  )
  const rows = page.items.flatMap((item) => {
    if (item.body.kind !== 'message' || !isRootAgentJournalItem(item)) {
      return []
    }
    const message = projectStructuredItemToNativeChat(item)
    return message
      ? project(message, submitted.get(item.itemId) ?? message.id).map((bubble) => ({
          bubble,
          sequence: item.sequence
        }))
      : []
  })
  const window = rows.slice(-PAGE_SIZE)
  const first = window[0]
  const nextCursor =
    rows.length > PAGE_SIZE && first
      ? { epoch: page.epoch, sequence: first.sequence }
      : page.hasOlder
        ? page.window.nextCursor
        : undefined
  const next = nextCursor ? JSON.stringify(nextCursor) : undefined
  return {
    messages: window.map(({ bubble }) => bubble),
    generation: page.epoch,
    ...(!cursor && latestNativeChatOrcaStopCut(page.items, page.submissions)
      ? { canContinue: true }
      : {}),
    ...(next && next !== before ? { before: next } : {}),
    ...(!result.ok ? { reset: true } : {})
  }
}
