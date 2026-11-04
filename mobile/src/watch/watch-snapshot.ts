import type {
  WatchFeedItem,
  WatchHost,
  WatchPrompt,
  WatchSession,
  WatchSnapshot
} from './watch-contract'

export const WATCH_SNAPSHOT_BYTE_LIMIT = 60 * 1024
const LATEST_LIMIT = 280
const DETAIL_LIMIT = 300
const FEED_LIMIT = 20

const STATUS_RANK: Record<WatchSession['status'], number> = {
  'needs-input': 0,
  working: 1,
  done: 2,
  idle: 2
}

export type WatchSnapshotChat = {
  hostId: string
  sessionId: string
  workspaceId: string
  workspaceName: string
  agent: string
  projectedStatus: 'working' | 'attention' | 'idle' | null
  conversationName?: string
  latestPrompt?: string
  lastAssistantMessage?: string
  toolName?: string
  updatedAt: number
}

export type WatchSnapshotTerminal = {
  hostId: string
  paneKey: string
  workspaceId: string
  workspaceName: string
  agent: string
  state: 'working' | 'blocked' | 'waiting' | 'done'
  conversationName?: string
  taskTitle?: string
  displayName?: string
  prompt?: string
  lastAssistantMessage?: string
  toolName?: string
  updatedAt: number
  structuredHostOwned?: boolean
}

export type WatchSnapshotInput = {
  now: number
  hosts: ReadonlyArray<WatchHost>
  chats: ReadonlyArray<WatchSnapshotChat>
  terminals: ReadonlyArray<WatchSnapshotTerminal>
  prompts: ReadonlyArray<WatchPrompt>
  feed: ReadonlyArray<WatchFeedItem>
}

export function watchSessionKey(hostId: string, kind: 'chat' | 'term', id: string): string {
  return `${hostId}|${kind}|${id}`
}

export function parseWatchSessionKey(
  key: string
): { hostId: string; kind: 'chat' | 'term'; id: string } | null {
  const first = key.indexOf('|')
  const second = key.indexOf('|', first + 1)
  if (first <= 0 || second <= first + 1 || second >= key.length - 1) {
    return null
  }
  const kind = key.slice(first + 1, second)
  if (kind !== 'chat' && kind !== 'term') {
    return null
  }
  return { hostId: key.slice(0, first), kind, id: key.slice(second + 1) }
}

function clip(value: string | undefined, limit: number): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) {
    return undefined
  }
  return trimmed.length <= limit ? trimmed : trimmed.slice(0, limit)
}

function firstText(values: Array<string | undefined>, fallback: string): string {
  for (const value of values) {
    const clipped = clip(value, 500)
    if (clipped) {
      return clipped
    }
  }
  return fallback
}

function compareSessions(a: WatchSession, b: WatchSession): number {
  const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status]
  return rank === 0 ? b.updatedAt - a.updatedAt : rank
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

function dropLastStatus(sessions: WatchSession[], status: WatchSession['status']): boolean {
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    if (sessions[index]?.status === status) {
      sessions.splice(index, 1)
      return true
    }
  }
  return false
}

export function buildWatchSnapshot(input: WatchSnapshotInput): WatchSnapshot {
  const prompts = input.prompts.map((prompt) => {
    const detail = clip(prompt.detail, DETAIL_LIMIT)
    return detail === undefined ? { ...prompt, detail: undefined } : { ...prompt, detail }
  })
  const promptBySession = new Map<string, WatchPrompt>()
  for (const prompt of [...prompts].sort((a, b) => b.createdAt - a.createdAt)) {
    if (!promptBySession.has(prompt.sessionKey)) {
      promptBySession.set(prompt.sessionKey, prompt)
    }
  }
  const connection = new Map(input.hosts.map((host) => [host.hostId, host.connection]))
  const sessions: WatchSession[] = []

  for (const chat of input.chats) {
    const key = watchSessionKey(chat.hostId, 'chat', chat.sessionId)
    const prompt = promptBySession.get(key)
    const status =
      prompt || chat.projectedStatus === 'attention'
        ? 'needs-input'
        : chat.projectedStatus === 'working'
          ? 'working'
          : 'idle'
    const toolName = clip(chat.toolName, 80)
    const latest = clip(chat.lastAssistantMessage ?? chat.latestPrompt, LATEST_LIMIT)
    sessions.push({
      key,
      hostId: chat.hostId,
      title: firstText([chat.conversationName, chat.latestPrompt, chat.agent], chat.sessionId),
      agent: clip(chat.agent, 80) ?? 'unknown',
      workspace: clip(chat.workspaceName, 120) ?? chat.workspaceId,
      status,
      ...(latest ? { latest } : {}),
      ...(toolName ? { toolName } : {}),
      updatedAt: chat.updatedAt,
      canSend: connection.get(chat.hostId) === 'connected',
      ...(prompt ? { pendingPromptId: prompt.promptId } : {})
    })
  }

  for (const terminal of input.terminals) {
    if (terminal.structuredHostOwned) {
      continue
    }
    const key = watchSessionKey(terminal.hostId, 'term', terminal.paneKey)
    const prompt = promptBySession.get(key)
    const status =
      prompt || terminal.state === 'blocked' || terminal.state === 'waiting'
        ? 'needs-input'
        : terminal.state === 'working'
          ? 'working'
          : terminal.state === 'done'
            ? 'done'
            : 'idle'
    const toolName = clip(terminal.toolName, 80)
    const latest = clip(terminal.lastAssistantMessage ?? terminal.prompt, LATEST_LIMIT)
    sessions.push({
      key,
      hostId: terminal.hostId,
      title: firstText(
        [
          terminal.conversationName,
          terminal.taskTitle,
          terminal.displayName,
          terminal.prompt,
          terminal.agent
        ],
        terminal.paneKey
      ),
      agent: clip(terminal.agent, 80) ?? 'unknown',
      workspace: clip(terminal.workspaceName, 120) ?? terminal.workspaceId,
      status,
      ...(latest ? { latest } : {}),
      ...(toolName ? { toolName } : {}),
      updatedAt: terminal.updatedAt,
      canSend: connection.get(terminal.hostId) === 'connected',
      ...(prompt ? { pendingPromptId: prompt.promptId } : {})
    })
  }

  sessions.sort(compareSessions)
  const feed = [...input.feed]
    .sort((a, b) => b.at - a.at)
    .slice(0, FEED_LIMIT)
    .map((item) => ({
      ...item,
      title: clip(item.title, LATEST_LIMIT) ?? '',
      body: clip(item.body, LATEST_LIMIT) ?? ''
    }))
  const hosts = input.hosts.map((host) => ({
    hostId: host.hostId,
    name: clip(host.name, 120) ?? host.hostId,
    connection: host.connection
  }))
  const visiblePrompts = prompts.map((prompt) => {
    const detail = clip(prompt.detail, DETAIL_LIMIT)
    return {
      hostId: prompt.hostId,
      promptId: prompt.promptId,
      sessionKey: prompt.sessionKey,
      kind: prompt.kind,
      title: clip(prompt.title, 300) ?? prompt.promptId,
      ...(detail ? { detail } : {}),
      options: prompt.options,
      createdAt: prompt.createdAt
    }
  })

  const assemble = (): WatchSnapshot => ({
    v: 1,
    generatedAt: input.now,
    hosts,
    sessions,
    prompts: visiblePrompts,
    feed
  })

  let snapshot = assemble()
  let guard = 0
  while (jsonBytes(snapshot) >= WATCH_SNAPSHOT_BYTE_LIMIT && guard < 10_000) {
    guard += 1
    if (dropLastStatus(sessions, 'done') || dropLastStatus(sessions, 'idle')) {
      snapshot = assemble()
      continue
    }
    if (feed.length > 0) {
      feed.pop()
      snapshot = assemble()
      continue
    }
    if (dropLastStatus(sessions, 'working') || clearOldestLatest(sessions)) {
      snapshot = assemble()
      continue
    }
    if (dropLastStatus(sessions, 'needs-input')) {
      snapshot = assemble()
      continue
    }
    if (visiblePrompts.length > 0) {
      visiblePrompts.pop()
      snapshot = assemble()
      continue
    }
    break
  }
  return snapshot
}

function clearOldestLatest(sessions: WatchSession[]): boolean {
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index]
    if (session?.latest) {
      delete session.latest
      return true
    }
  }
  return false
}
