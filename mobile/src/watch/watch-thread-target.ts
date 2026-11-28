import type { WatchFeedItem } from './watch-contract'
import type { WatchGatewaySources } from './watch-gateway'
import {
  parseWatchSessionKey,
  watchSessionKey,
  type WatchSnapshotChat,
  type WatchSnapshotTerminal
} from './watch-snapshot'
import { isNativeChatSupportedAgent } from '../../../src/shared/native-chat/native-chat-agent-support'

export type WatchThreadTarget = NonNullable<ReturnType<typeof parseWatchSessionKey>> & {
  workspaceId?: string
  agent?: string
  providerSession?: WatchSnapshotTerminal['providerSession']
  canStop?: boolean
}

export function findLiveWatchThread(
  sources: WatchGatewaySources,
  key: string
): WatchThreadTarget | null {
  const parsed = parseWatchSessionKey(key)
  if (!parsed) {
    return null
  }
  if (parsed.kind === 'item') {
    const item = sources.items?.find((item) => item.key === key)
    return item ? { ...parsed, workspaceId: item.workspaceId } : null
  }
  if (parsed.kind === 'chat') {
    const chat = sources.chats.find(
      (session) => session.hostId === parsed.hostId && session.sessionId === parsed.id
    )
    return chat
      ? { ...parsed, workspaceId: chat.workspaceId, canStop: chat.projectedStatus === 'working' }
      : null
  }
  const terminal = sources.terminals.find(
    (session) =>
      !session.structuredHostOwned &&
      session.hostId === parsed.hostId &&
      session.paneKey === parsed.id
  )
  return terminal
    ? {
        ...parsed,
        workspaceId: terminal.workspaceId,
        agent: terminal.agent,
        canStop: terminal.state === 'working' && isNativeChatSupportedAgent(terminal.agent),
        providerSession: terminal.providerSession
      }
    : null
}

export function mergeWatchThreadChats(
  live: readonly WatchSnapshotChat[],
  activity: readonly WatchSnapshotChat[],
  feed: readonly WatchFeedItem[]
): WatchSnapshotChat[] {
  const chats = new Map(
    activity.map((chat) => [watchSessionKey(chat.hostId, 'chat', chat.sessionId), chat])
  )
  for (const chat of live) {
    const key = watchSessionKey(chat.hostId, 'chat', chat.sessionId)
    chats.set(key, { ...chats.get(key), ...chat })
  }
  for (const { sessionKey, workspaceId, title, at } of feed) {
    const target = sessionKey && parseWatchSessionKey(sessionKey)
    if (sessionKey && target && target.kind === 'chat' && workspaceId && !chats.has(sessionKey)) {
      chats.set(sessionKey, {
        hostId: target.hostId,
        sessionId: target.id,
        workspaceId,
        workspaceName: workspaceId,
        conversationName: title,
        agent: 'Agent',
        updatedAt: at,
        projectedStatus: null
      })
    }
  }
  return [...chats.values()]
}
