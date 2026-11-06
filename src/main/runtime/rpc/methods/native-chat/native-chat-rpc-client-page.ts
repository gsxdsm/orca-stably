import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import type { NativeChatTranscriptPage } from '../../../../../shared/native-chat/native-chat-transcript-frames'
import { resolveNativeChatTranscriptAgent } from '../../../../../shared/native-chat/native-chat-agent-support'
import { windowNativeChatWithChildren } from '../../../../native-chat/transcript-subagent-children'
import type { RpcContext } from '../../core'
import { sanitizeNativeChatRpcMessage } from './native-chat-rpc-block-sanitize'
import { boundNativeChatRpcPageByBytes } from './native-chat-rpc-page-bounds'
import { MOBILE_NATIVE_CHAT_MAX_WINDOW } from '../../../../../shared/rpc-contract/native-chat-params'

// Default to a small transcript tail for fast paired-client paint; clients page older history, while local IPC stays virtualized.
export const MOBILE_NATIVE_CHAT_DEFAULT_WINDOW = 40

/** Window every RPC client by message count; apply mobile-only character clipping separately. */
function windowTranscript(
  messages: readonly NativeChatMessage[],
  limit = MOBILE_NATIVE_CHAT_DEFAULT_WINDOW
): NativeChatMessage[] {
  const window = Math.min(Math.max(limit, 1), MOBILE_NATIVE_CHAT_MAX_WINDOW)
  return windowNativeChatWithChildren(messages, window)
}

export function isDatabaseTranscript(agent: string | undefined): boolean {
  const source = resolveNativeChatTranscriptAgent(agent)
  return source === 'opencode' || source === 'hermes'
}

export function pageForClient(
  messages: readonly NativeChatMessage[],
  hasMore: boolean,
  beforeOffset: number,
  clientKind: RpcContext['clientKind'],
  limit = MOBILE_NATIVE_CHAT_DEFAULT_WINDOW,
  agent?: string
): NativeChatTranscriptPage {
  const isDatabase = isDatabaseTranscript(agent)
  const sanitized = (isDatabase ? messages : windowTranscript(messages, limit)).map((message) =>
    sanitizeNativeChatRpcMessage(message, clientKind)
  )
  return isDatabase
    ? boundNativeChatRpcPageByBytes(sanitized, hasMore, beforeOffset)
    : { messages: sanitized, hasMore, beforeOffset }
}
