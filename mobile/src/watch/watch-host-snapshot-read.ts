import * as z from 'zod'
import type { RpcClient } from '../transport/rpc-client'
import { worktreeCatalogRead } from '../worktree/worktree-catalog-operations'
import { WORKTREE_PS_FULL_LIMIT } from '../worktree/worktree-catalog-snapshot-client'
import { mobileStructuredSessionStatusFeed } from '../session/mobile-structured-session-status-feed'
import { agentPromptListPending } from './watch-agent-prompt-operations'
import type { WatchFeedItem, WatchPrompt } from './watch-contract'
import {
  watchSessionKey,
  type WatchSnapshotChat,
  type WatchSnapshotTerminal
} from './watch-snapshot'

const agentRowSchema = z.looseObject({
  paneKey: z.string().min(1),
  terminalHandle: z.string().min(1).optional(),
  state: z.enum(['working', 'blocked', 'waiting', 'done']),
  agentType: z.string().nullable().optional(),
  prompt: z.string().optional(),
  taskTitle: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  conversationName: z.string().optional(),
  lastAssistantMessage: z.string().nullable().optional(),
  toolName: z.string().nullable().optional(),
  updatedAt: z.number(),
  structuredHostOwned: z.literal(true).optional()
})

const worktreeRowSchema = z.looseObject({
  worktreeId: z.string().min(1),
  displayName: z.string().optional(),
  agents: z.array(z.unknown()).optional()
})

const notificationSchema = z.looseObject({
  type: z.literal('notification'),
  title: z.string(),
  body: z.string(),
  emittedAt: z.number().optional(),
  source: z.enum(['agent-task-complete', 'terminal-bell', 'test', 'plugin']).optional(),
  agentState: z.enum(['working', 'blocked', 'waiting', 'done']).optional(),
  paneKey: z.string().optional(),
  notificationId: z.string().optional()
})

export type WatchStoredPrompt = WatchPrompt & {
  agent: string
  worktreeId: string
  targetKind: 'chat' | 'term'
  targetId: string
}

export type WatchWorktreeRow = {
  worktreeId: string
  displayName: string
  agents: Array<z.infer<typeof agentRowSchema>>
}

export async function readWatchWorktrees(client: RpcClient): Promise<WatchWorktreeRow[]> {
  try {
    const reply = await worktreeCatalogRead.request(client, { limit: WORKTREE_PS_FULL_LIMIT })
    const catalog = worktreeCatalogRead.interpret(reply)
    if (!catalog.accepted || !Array.isArray(catalog.value.worktrees)) {
      return []
    }
    const rows: WatchWorktreeRow[] = []
    for (const raw of catalog.value.worktrees) {
      const parsed = worktreeRowSchema.safeParse(raw)
      if (!parsed.success) {
        continue
      }
      const agents = []
      for (const agent of parsed.data.agents ?? []) {
        const row = agentRowSchema.safeParse(agent)
        if (row.success) {
          agents.push(row.data)
        }
      }
      rows.push({
        worktreeId: parsed.data.worktreeId,
        displayName: parsed.data.displayName?.trim() || parsed.data.worktreeId,
        agents
      })
    }
    return rows
  } catch {
    return []
  }
}

export async function readWatchPrompts(
  client: RpcClient,
  hostId: string
): Promise<WatchStoredPrompt[]> {
  try {
    const response = await agentPromptListPending.request(client, {})
    const parsed = agentPromptListPending.interpret(response)
    if (!parsed) {
      return []
    }
    return parsed.prompts.map((prompt) => {
      const targetKind = prompt.target.type === 'chat' ? 'chat' : 'term'
      const targetId =
        prompt.target.type === 'chat' ? prompt.target.sessionId : prompt.target.terminal
      return {
        hostId,
        promptId: prompt.promptId,
        sessionKey: watchSessionKey(hostId, targetKind, targetId),
        kind: prompt.kind,
        title: prompt.title,
        ...(prompt.detail ? { detail: prompt.detail } : {}),
        options: prompt.options,
        createdAt: prompt.createdAt,
        agent: prompt.agent,
        worktreeId: prompt.worktreeId,
        targetKind,
        targetId
      }
    })
  } catch {
    return []
  }
}

export function watchFeedItemFromNotification(
  hostId: string,
  data: unknown,
  now: number
): WatchFeedItem | null {
  const parsed = notificationSchema.safeParse(data)
  if (!parsed.success) {
    return null
  }
  const event = parsed.data
  const kind =
    event.agentState === 'blocked' || event.agentState === 'waiting'
      ? 'needs-input'
      : event.source === 'agent-task-complete'
        ? 'finished'
        : event.source === 'terminal-bell'
          ? 'bell'
          : 'other'
  const sessionKey = event.paneKey ? watchSessionKey(hostId, 'term', event.paneKey) : undefined
  return {
    id: event.notificationId ?? `${hostId}:${event.emittedAt ?? now}:${event.title}`,
    hostId,
    ...(sessionKey ? { sessionKey } : {}),
    title: event.title,
    body: event.body,
    at: event.emittedAt ?? now,
    kind
  }
}

function mapTerminals(hostId: string, rows: readonly WatchWorktreeRow[]): WatchSnapshotTerminal[] {
  const terminals: WatchSnapshotTerminal[] = []
  for (const row of rows) {
    for (const agent of row.agents) {
      terminals.push({
        hostId,
        paneKey: agent.paneKey,
        ...(agent.terminalHandle ? { terminalHandle: agent.terminalHandle } : {}),
        workspaceId: row.worktreeId,
        workspaceName: row.displayName,
        agent: agent.agentType ?? 'unknown',
        state: agent.state,
        ...(agent.conversationName ? { conversationName: agent.conversationName } : {}),
        ...(agent.taskTitle ? { taskTitle: agent.taskTitle } : {}),
        ...(agent.displayName ? { displayName: agent.displayName } : {}),
        ...(agent.prompt ? { prompt: agent.prompt } : {}),
        ...(agent.lastAssistantMessage ? { lastAssistantMessage: agent.lastAssistantMessage } : {}),
        ...(agent.toolName ? { toolName: agent.toolName } : {}),
        updatedAt: agent.updatedAt,
        ...(agent.structuredHostOwned ? { structuredHostOwned: true } : {})
      })
    }
  }
  return terminals
}

function mapChats(
  hostId: string,
  client: RpcClient,
  rows: readonly WatchWorktreeRow[]
): WatchSnapshotChat[] {
  const names = new Map(rows.map((row) => [row.worktreeId, row.displayName]))
  return [...mobileStructuredSessionStatusFeed(client).getSnapshot().values()].map((summary) => ({
    hostId,
    sessionId: summary.sessionId,
    workspaceId: summary.workspaceId,
    workspaceName: names.get(summary.workspaceId) ?? summary.workspaceId,
    agent: summary.agent,
    projectedStatus: summary.status,
    ...(summary.conversationName ? { conversationName: summary.conversationName } : {}),
    ...(summary.latestPrompt ? { latestPrompt: summary.latestPrompt } : {}),
    ...(summary.lastAssistantMessage ? { lastAssistantMessage: summary.lastAssistantMessage } : {}),
    ...(summary.toolName ? { toolName: summary.toolName } : {}),
    updatedAt: summary.updatedAt
  }))
}

export function assembleWatchSources(input: {
  hosts: Iterable<{ hostId: string; client: RpcClient }>
  rows: ReadonlyMap<string, WatchWorktreeRow[]>
  prompts: ReadonlyMap<string, WatchStoredPrompt[]>
  feed: readonly WatchFeedItem[]
}): {
  chats: WatchSnapshotChat[]
  terminals: WatchSnapshotTerminal[]
  prompts: WatchPrompt[]
  feed: WatchFeedItem[]
} {
  const chats: WatchSnapshotChat[] = []
  const terminals: WatchSnapshotTerminal[] = []
  for (const host of input.hosts) {
    const hostRows = input.rows.get(host.hostId) ?? []
    chats.push(...mapChats(host.hostId, host.client, hostRows))
    terminals.push(...mapTerminals(host.hostId, hostRows))
  }
  for (const prompt of input.prompts.values()) {
    for (const item of prompt) {
      const known =
        item.targetKind === 'chat'
          ? chats.some((chat) => chat.hostId === item.hostId && chat.sessionId === item.targetId)
          : terminals.some(
              (terminal) => terminal.hostId === item.hostId && terminal.paneKey === item.targetId
            )
      if (known) {
        continue
      }
      const workspaceName =
        input.rows.get(item.hostId)?.find((row) => row.worktreeId === item.worktreeId)
          ?.displayName ?? item.worktreeId
      if (item.targetKind === 'chat') {
        chats.push({
          hostId: item.hostId,
          sessionId: item.targetId,
          workspaceId: item.worktreeId,
          workspaceName,
          agent: item.agent,
          projectedStatus: 'attention',
          conversationName: item.title,
          ...(item.detail ? { latestPrompt: item.detail } : {}),
          updatedAt: item.createdAt
        })
      } else {
        terminals.push({
          hostId: item.hostId,
          paneKey: item.targetId,
          terminalHandle: item.targetId,
          workspaceId: item.worktreeId,
          workspaceName,
          agent: item.agent,
          state: 'waiting',
          conversationName: item.title,
          ...(item.detail ? { prompt: item.detail } : {}),
          updatedAt: item.createdAt
        })
      }
    }
  }
  return {
    chats,
    terminals,
    prompts: [...input.prompts.values()].flat().map((prompt) => ({
      hostId: prompt.hostId,
      promptId: prompt.promptId,
      sessionKey: prompt.sessionKey,
      kind: prompt.kind,
      title: prompt.title,
      ...(prompt.detail ? { detail: prompt.detail } : {}),
      options: prompt.options,
      createdAt: prompt.createdAt
    })),
    feed: [...input.feed]
  }
}
