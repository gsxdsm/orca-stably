import { chatPaneKey } from '../../../src/shared/agent-session/view/structured-agent-session-projection'
import { isNativeChatSupportedAgent } from '../../../src/shared/native-chat/native-chat-agent-support'
import type {
  WatchBot,
  WatchFeedItem,
  WatchHost,
  WatchNeed,
  WatchPrompt,
  WatchSession,
  WatchSnapshot,
  WatchUsage
} from './watch-contract'

import { buildWatchNeeds } from './watch-needs'

export const WATCH_SNAPSHOT_BYTE_LIMIT = 60 * 1024
const LATEST_LIMIT = 280
const DETAIL_LIMIT = 300
const FEED_LIMIT = 20
const BOTS_LIMIT = 40
const NEEDS_LIMIT = 80
const USAGE_LIMIT = 32

const STATUS_RANK: Record<WatchSession['status'], number> = {
  'needs-input': 0,
  working: 1,
  done: 2,
  idle: 2
}

export type WatchSessionKind = 'chat' | 'term' | 'item'
export type WatchSnapshotItem = WatchSession & { workspaceId: string }

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
  /** Issued handle for `terminal.send`. A pane key is not one. */
  terminalHandle?: string
  providerSession?: { id: string; transcriptPath?: string }
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
  items?: ReadonlyArray<WatchSnapshotItem>
  prompts: ReadonlyArray<WatchPrompt>
  feed: ReadonlyArray<WatchFeedItem>
  bots?: ReadonlyArray<WatchBot>
  needsYou?: ReadonlyArray<WatchNeed>
  usage?: ReadonlyArray<WatchUsage>
}

export function watchSessionKey(hostId: string, kind: WatchSessionKind, id: string): string {
  return `${hostId}|${kind}|${id}`
}

export function parseWatchSessionKey(
  key: string
): { hostId: string; kind: WatchSessionKind; id: string } | null {
  const first = key.indexOf('|')
  const second = key.indexOf('|', first + 1)
  if (first <= 0 || second <= first + 1 || second >= key.length - 1) {
    return null
  }
  const kind = key.slice(first + 1, second)
  if (kind !== 'chat' && kind !== 'term' && kind !== 'item') {
    return null
  }
  return { hostId: key.slice(0, first), kind, id: key.slice(second + 1) }
}

export function clipWatchText(value: string | undefined, limit: number): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) {
    return undefined
  }
  if (trimmed.length <= limit) {
    return trimmed
  }
  // A UTF-16 slice must not turn a supplementary character into invalid Swift JSON.
  const last = trimmed.charCodeAt(limit - 1)
  return trimmed.slice(0, last >= 0xd800 && last <= 0xdbff ? limit - 1 : limit)
}

function firstText(values: Array<string | undefined>, fallback: string): string {
  for (const value of values) {
    const clipped = clipWatchText(value, 500)
    if (clipped) {
      return clipped
    }
  }
  return fallback
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

export function buildWatchSnapshot(input: WatchSnapshotInput): WatchSnapshot {
  const prompts = input.prompts
  const promptBySession = new Map<string, WatchPrompt>()
  for (const prompt of [...prompts].sort((a, b) => b.createdAt - a.createdAt)) {
    if (!promptBySession.has(prompt.sessionKey)) {
      promptBySession.set(prompt.sessionKey, prompt)
    }
  }
  const connection = new Map(input.hosts.map((host) => [host.hostId, host.connection]))
  const sessions: WatchSession[] = (input.items ?? []).map(({ workspaceId, ...item }) => ({
    ...item,
    workspace: item.workspace || workspaceId,
    canSend: item.canSend && connection.get(item.hostId) === 'connected'
  }))

  for (const chat of input.chats) {
    const key = watchSessionKey(chat.hostId, 'chat', chat.sessionId)
    const prompt = promptBySession.get(key)
    const status =
      prompt || chat.projectedStatus === 'attention'
        ? 'needs-input'
        : chat.projectedStatus === 'working'
          ? 'working'
          : 'idle'
    const toolName = clipWatchText(chat.toolName, 80)
    const latest = clipWatchText(chat.lastAssistantMessage ?? chat.latestPrompt, LATEST_LIMIT)
    sessions.push({
      key,
      hostId: chat.hostId,
      title: firstText([chat.conversationName, chat.latestPrompt, chat.agent], chat.sessionId),
      agent: clipWatchText(chat.agent, 80) ?? 'unknown',
      workspace: clipWatchText(chat.workspaceName, 120) ?? chat.workspaceId,
      status,
      ...(latest ? { latest } : {}),
      ...(toolName ? { toolName } : {}),
      updatedAt: chat.updatedAt,
      canSend: connection.get(chat.hostId) === 'connected',
      ...(status === 'working' ? { canStop: true } : {}),
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
    const toolName = clipWatchText(terminal.toolName, 80)
    const latest = clipWatchText(terminal.lastAssistantMessage ?? terminal.prompt, LATEST_LIMIT)
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
      agent: clipWatchText(terminal.agent, 80) ?? 'unknown',
      workspace: clipWatchText(terminal.workspaceName, 120) ?? terminal.workspaceId,
      status,
      ...(latest ? { latest } : {}),
      ...(toolName ? { toolName } : {}),
      updatedAt: terminal.updatedAt,
      canSend: connection.get(terminal.hostId) === 'connected',
      ...(status === 'working' && isNativeChatSupportedAgent(terminal.agent)
        ? { canStop: true }
        : {}),
      ...(prompt ? { pendingPromptId: prompt.promptId } : {})
    })
  }

  sessions.sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.updatedAt - a.updatedAt
  )
  const feed = [...input.feed]
    .sort((a, b) => b.at - a.at)
    .slice(0, FEED_LIMIT)
    .map((item) => ({
      ...item,
      title: clipWatchText(item.title, LATEST_LIMIT) ?? '',
      body: clipWatchText(item.body, LATEST_LIMIT) ?? ''
    }))
  const hosts = input.hosts.map((host) => ({
    hostId: host.hostId,
    name: clipWatchText(host.name, 120) ?? host.hostId,
    connection: host.connection,
    ...(host.fingerprint ? { fingerprint: host.fingerprint } : {})
  }))
  const visiblePrompts = prompts.map((prompt) => {
    const detail = clipWatchText(prompt.detail, DETAIL_LIMIT)
    return {
      hostId: prompt.hostId,
      promptId: prompt.promptId,
      sessionKey: prompt.sessionKey,
      kind: prompt.kind,
      title: clipWatchText(prompt.title, 300) ?? prompt.promptId,
      ...(detail ? { detail } : {}),
      options: prompt.options,
      createdAt: prompt.createdAt
    }
  })

  const bots = input.bots
    ?.slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, BOTS_LIMIT)
    .map((row) => ({ ...row, name: clipWatchText(row.name, 100) ?? 'Bot' }))
  const paneAliases = new Map(
    input.chats.map(({ hostId, sessionId }) => [
      watchSessionKey(hostId, 'term', chatPaneKey(sessionId)),
      watchSessionKey(hostId, 'chat', sessionId)
    ])
  )
  const needsYou =
    input.needsYou &&
    buildWatchNeeds(
      input.needsYou.map((row) => {
        const alias = row.sessionKey && paneAliases.get(row.sessionKey)
        return alias ? { ...row, sessionKey: alias } : row
      }),
      sessions,
      visiblePrompts
    )
      .slice(0, NEEDS_LIMIT)
      .map((row) => ({ ...row, title: clipWatchText(row.title, 160) ?? 'Needs you' }))
  const usage = input.usage
    ?.slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, USAGE_LIMIT)
  const snapshot: WatchSnapshot = {
    v: 1,
    generatedAt: input.now,
    hosts,
    sessions,
    prompts: visiblePrompts,
    feed,
    bots,
    needsYou,
    usage
  }
  let bytes = jsonBytes(snapshot)
  const overBudget = () => bytes >= WATCH_SNAPSHOT_BYTE_LIMIT
  function trim<T>(rows: T[], keep: (row: T) => boolean = () => false) {
    while (overBudget() && rows.length > 0) {
      const row = rows[rows.length - 1]!
      if (keep(row)) {
        break
      }
      rows.pop()
      bytes -= jsonBytes(row) + Number(rows.length > 0)
    }
  }
  trim(sessions, (row) => row.status !== 'done' && row.status !== 'idle')
  trim(feed)
  trim(sessions, (row) => row.status !== 'working')
  for (let index = sessions.length - 1; index >= 0 && overBudget(); index -= 1) {
    const session = sessions[index]
    if (session?.latest) {
      bytes -= jsonBytes(session)
      delete session.latest
      bytes += jsonBytes(session)
    }
  }
  trim(bots ?? [])
  trim(usage ?? [])
  trim(needsYou ?? [])
  trim(sessions)
  trim(visiblePrompts)
  trim(hosts)
  const sessionKeys = new Set(sessions.map((row) => row.key))
  for (const need of needsYou ?? []) {
    if (need.sessionKey && !sessionKeys.has(need.sessionKey)) {
      delete need.sessionKey
    }
  }
  return snapshot
}
