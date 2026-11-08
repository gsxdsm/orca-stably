import type { NativeChatMessage } from '../../../../src/shared/native-chat/native-chat-types'
import type { RpcClient } from '../../transport/rpc/rpc-client-contract'
import { nativeChatSessionPageRead } from './agent-session/mobile-native-chat-page-read-operations'

const PAGE = 60
const MAX_MESSAGES = 2000

function nextPageWindow(
  limit: number,
  listLength: number
): { nextLimit: number; pageLimit: number } | null {
  // Live output grows the list past the last read, so the next page counts from what is held.
  const held = Math.max(limit, listLength)
  const nextLimit = Math.min(held + PAGE, MAX_MESSAGES)
  return nextLimit > held ? { nextLimit, pageLimit: nextLimit - held } : null
}

type ReadSessionResult =
  | { messages: NativeChatMessage[]; hasMore?: boolean; beforeOffset?: number }
  | { error: string }

export async function readMobileNativeChatOlderPage(args: {
  client: RpcClient
  agent: string
  sessionId: string
  transcriptPath: string | null
  limit: number
  list: () => readonly NativeChatMessage[]
  beforeOffset: number | null
  timeoutMs: number
  stillCurrent: () => boolean
}): Promise<
  | 'failed'
  | 'none'
  | 'stale'
  | {
      kind: 'page'
      nextLimit: number
      messages: NativeChatMessage[]
      beforeOffset: number | null
      hasMore: boolean
    }
> {
  const page = nextPageWindow(args.limit, args.list().length)
  if (!page) {
    return 'none'
  }
  const { nextLimit, pageLimit } = page
  const beforeOffset = args.beforeOffset
  const response = await nativeChatSessionPageRead.request(
    args.client,
    {
      agent: args.agent,
      sessionId: args.sessionId,
      limit: beforeOffset === null ? nextLimit : pageLimit,
      capabilities: { transcriptSourceOrder: 1 },
      ...(beforeOffset === null ? {} : { beforeOffset }),
      ...(args.transcriptPath ? { transcriptPath: args.transcriptPath } : {})
    },
    { timeoutMs: args.timeoutMs, budgetSpansConnect: true }
  )
  const accepted = nativeChatSessionPageRead.interpret(response)
  if (!accepted.accepted) {
    return 'failed'
  }
  // Accepted legacy-union replies may be absent/null; validate before using the in operator.
  const payload = accepted.value
  if (payload === null || typeof payload !== 'object') {
    return 'failed'
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: main cast this payload unread; the reader hands back the same result.
  const result = payload as ReadSessionResult
  if ('error' in result) {
    return 'failed'
  }
  // Apply pages only to their captured window/cursor; otherwise retry from the new window.
  if (!args.stillCurrent()) {
    return 'stale'
  }
  const live = args.list()
  let messages: NativeChatMessage[]
  let more: boolean
  let nextBeforeOffset = beforeOffset
  if (beforeOffset !== null && result.beforeOffset != null) {
    nextBeforeOffset = result.beforeOffset
    messages = [...result.messages, ...live]
    more = nextLimit < MAX_MESSAGES && (result.hasMore ?? result.messages.length >= pageLimit)
  } else {
    // Legacy hosts return a growing tail instead of cursor pages; preserve rows streamed during the read.
    const after = live.findIndex((message) => message.id === result.messages.at(-1)?.id)
    messages = after === -1 ? result.messages : [...result.messages, ...live.slice(after + 1)]
    more = result.messages.length >= nextLimit
  }
  return {
    kind: 'page',
    nextLimit,
    messages,
    beforeOffset: nextBeforeOffset,
    hasMore: more
  }
}
