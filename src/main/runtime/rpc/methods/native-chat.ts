import { z } from 'zod'
import type { NativeChatBlock, NativeChatMessage } from '../../../../shared/native-chat-types'
import type { AgentType } from '../../../../shared/native-chat-types'
import { readNativeChatTranscript } from '../../../native-chat/transcript-reader'
import { subscribeNativeChatTranscript } from '../../../native-chat/transcript-watch'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'

// Why: native chat renders an agent's own transcript (Claude/Codex JSONL). The
// desktop reaches the readers via Electron IPC; mobile/web clients reach the
// same pure readers through these runtime RPC methods so the native chat view
// works over the paired connection, not just in the desktop renderer.

const NativeChatSession = z.object({
  agent: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing agent'))
    .transform((v) => v as AgentType),
  sessionId: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing session id')),
  // How many of the most-recent messages to return. Clients start small for a
  // fast first paint and raise it to page older history in as the user scrolls.
  limit: z.number().int().positive().max(2000).optional()
})

const NativeChatUnsubscribe = z.object({
  subscriptionId: z.string().min(1).optional()
})

// Why: a long agent session can hold thousands of turns (with full tool I/O).
// Shipping all of them over the paired connection and rendering them at once
// freezes the mobile app, so the runtime RPC windows to the most recent slice —
// the conversation tail is what the chat view shows first. The desktop IPC path
// is unaffected (it reads locally with a virtualized list).
// Small first page for a fast initial paint; the client raises `limit` to load
// older history as the user scrolls back.
const MOBILE_NATIVE_CHAT_DEFAULT_WINDOW = 40
const MOBILE_NATIVE_CHAT_MAX_WINDOW = 2000
// Why: a single tool result (a big file read, a long diff) can be hundreds of KB.
// The mobile view only previews block bodies, so truncate them on the wire to
// keep the payload small; the marker tells the user content was clipped.
const MOBILE_BLOCK_CHAR_CAP = 4000
const TRUNCATION_MARKER = '\n… (truncated)'

function clip(text: string): string {
  return text.length > MOBILE_BLOCK_CHAR_CAP
    ? text.slice(0, MOBILE_BLOCK_CHAR_CAP) + TRUNCATION_MARKER
    : text
}

function clipBlock(block: NativeChatBlock): NativeChatBlock {
  if (block.type === 'text') {
    return block.text.length > MOBILE_BLOCK_CHAR_CAP ? { ...block, text: clip(block.text) } : block
  }
  if (block.type === 'tool-result') {
    return block.output.length > MOBILE_BLOCK_CHAR_CAP
      ? { ...block, output: clip(block.output) }
      : block
  }
  return block
}

function sanitizeMessage(message: NativeChatMessage): NativeChatMessage {
  return { ...message, blocks: message.blocks.map(clipBlock) }
}

/** Window a transcript to its most recent `limit` messages and clip oversized
 *  blocks, so a long, tool-heavy session can't freeze the mobile app or blow the
 *  wire frame. */
function windowForMobile(
  messages: readonly NativeChatMessage[],
  limit = MOBILE_NATIVE_CHAT_DEFAULT_WINDOW
): NativeChatMessage[] {
  const window = Math.min(Math.max(limit, 1), MOBILE_NATIVE_CHAT_MAX_WINDOW)
  const tail = messages.length > window ? messages.slice(-window) : messages
  return tail.map(sanitizeMessage)
}

export const NATIVE_CHAT_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'nativeChat.readSession',
    params: NativeChatSession,
    handler: async (params) => {
      const result = await readNativeChatTranscript(params.agent, params.sessionId)
      // Window to the conversation tail; a huge transcript otherwise hangs mobile.
      return 'messages' in result
        ? { messages: windowForMobile(result.messages, params.limit) }
        : result
    }
  }),
  defineStreamingMethod({
    name: 'nativeChat.subscribe',
    params: NativeChatSession,
    handler: async (params, { runtime, connectionId }, emit) => {
      let closed = false
      let unsubscribe = (): void => {}
      // Why: the subscriber seeds its read offset at 0, so the first drain emits
      // the whole transcript and later drains emit only appended turns. The first
      // batch is windowed to the tail (a full transcript would freeze mobile);
      // later incremental batches are smaller than the window so they pass through.
      // Clients merge by message id, so the initial windowed batch doubles as the
      // snapshot. Keyed by agent:sessionId (not the RPC request id) so the client —
      // which only knows agent+sessionId — can target the watcher on unsubscribe.
      const subscriptionId = `nativeChat:${connectionId ?? 'local'}:${params.agent}:${params.sessionId}`
      runtime.registerSubscriptionCleanup(
        subscriptionId,
        () => {
          closed = true
          unsubscribe()
          emit({ type: 'end' })
        },
        connectionId
      )
      if (closed) {
        return
      }
      const subscription = await subscribeNativeChatTranscript({
        agent: params.agent,
        sessionId: params.sessionId,
        onAppend: (messages) => {
          if (closed) {
            return
          }
          emit({ type: 'appended', messages: windowForMobile(messages) })
        }
      })
      // The connection may have closed while the file was being resolved.
      if (closed) {
        subscription.unsubscribe()
        return
      }
      unsubscribe = subscription.unsubscribe
    }
  }),
  defineMethod({
    name: 'nativeChat.unsubscribe',
    params: NativeChatUnsubscribe,
    handler: async (params, { runtime, connectionId }) => {
      const connection = connectionId ?? 'local'
      if (params.subscriptionId) {
        runtime.cleanupSubscription(`nativeChat:${connection}:${params.subscriptionId}`)
        return { unsubscribed: true }
      }
      runtime.cleanupSubscriptionsByPrefix(`nativeChat:${connection}:`)
      return { unsubscribed: true }
    }
  })
]
