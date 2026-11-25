import type { WatchCommand, WatchHost, WatchReply, WatchSnapshot } from './watch-contract'
import { watchCommandSchema } from './watch-contract'
import { createWatchCommandDedupe } from './watch-command-dedupe'
import {
  buildWatchSnapshot,
  parseWatchSessionKey,
  watchSessionKey,
  type WatchSnapshotChat,
  type WatchSnapshotInput,
  type WatchSnapshotTerminal
} from './watch-snapshot'

export const WATCH_PUSH_INTERVAL_MS = 2_000

export type WatchGatewaySources = Pick<
  WatchSnapshotInput,
  'chats' | 'terminals' | 'prompts' | 'feed'
>

export type WatchSendOutcome = 'accepted' | 'queued' | 'rejected' | 'unavailable' | 'no-fence'

export type WatchSendResult = {
  outcome: WatchSendOutcome
  detail?: string
}

export type WatchGatewayHandlers = {
  now: () => number
  hosts: () => ReadonlyArray<WatchHost>
  sources: () => WatchGatewaySources
  respond: (
    hostId: string,
    input: { promptId: string; optionId: string; clientOperationId: string }
  ) => Promise<
    { ok: true } | { ok: false; reason: 'stale' | 'not_found' | 'rejected' | 'unavailable' }
  >
  sendChat: (
    hostId: string,
    sessionId: string,
    text: string,
    clientOperationId: string
  ) => Promise<WatchSendResult>
  sendTerminal: (
    hostId: string,
    target: { workspaceId?: string; paneKey: string },
    text: string
  ) => Promise<boolean>
  openSession: (target: {
    hostId: string
    kind: 'chat' | 'term'
    id: string
    workspaceId?: string
    paneKey?: string
  }) => void
  push: (snapshot: WatchSnapshot) => void
  schedule: (delayMs: number, run: () => void) => () => void
}

export function watchSendOutcomeFromHost(outcome: string): WatchSendOutcome {
  if (
    outcome === 'accepted' ||
    outcome === 'queued' ||
    outcome === 'rejected' ||
    outcome === 'unavailable' ||
    outcome === 'no-fence'
  ) {
    return outcome
  }
  return 'unavailable'
}

function failure(
  id: string,
  reason: Extract<WatchReply, { ok: false }>['reason'],
  detail?: string
): WatchReply {
  return detail ? { v: 1, id, ok: false, reason, detail } : { v: 1, id, ok: false, reason }
}

function success(id: string, snapshot: WatchSnapshot): WatchReply {
  return { v: 1, id, ok: true, snapshot }
}

function commandId(raw: unknown): string {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('id' in raw) ||
    typeof raw.id !== 'string' ||
    raw.id.length === 0
  ) {
    return 'invalid'
  }
  return raw.id
}

function needsInputKey(snapshot: WatchSnapshot): string {
  return snapshot.sessions
    .filter((session) => session.status === 'needs-input')
    .map((session) => session.key)
    .join('\n')
}

export function createWatchGatewayController(handlers: WatchGatewayHandlers) {
  const dedupe = createWatchCommandDedupe(handlers.now)
  let lastPushAt: number | null = null
  let lastNeeds = ''
  let cancelTimer: (() => void) | null = null

  function current(): WatchSnapshot {
    const sources = handlers.sources()
    return buildWatchSnapshot({
      now: handlers.now(),
      hosts: handlers.hosts(),
      chats: sources.chats,
      terminals: sources.terminals,
      prompts: sources.prompts,
      feed: sources.feed
    })
  }

  function cancelScheduledPush() {
    cancelTimer?.()
    cancelTimer = null
  }

  function emit(snapshot: WatchSnapshot, immediate: boolean) {
    const needs = needsInputKey(snapshot)
    const needsChanged = needs !== lastNeeds
    lastNeeds = needs
    const elapsed = lastPushAt === null ? WATCH_PUSH_INTERVAL_MS : handlers.now() - lastPushAt
    if (immediate || needsChanged || elapsed >= WATCH_PUSH_INTERVAL_MS) {
      cancelScheduledPush()
      handlers.push(snapshot)
      lastPushAt = handlers.now()
      return
    }
    if (cancelTimer) {
      return
    }
    cancelTimer = handlers.schedule(WATCH_PUSH_INTERVAL_MS - elapsed, () => {
      cancelTimer = null
      emit(current(), true)
    })
  }

  function connection(hostId: string): WatchHost['connection'] | null {
    return handlers.hosts().find((host) => host.hostId === hostId)?.connection ?? null
  }

  function hostReady(hostId: string, id: string): WatchReply | null {
    const state = connection(hostId)
    if (state === 'connected') {
      return null
    }
    // Still dialing after a cold wake: the watch retries this id. A known-down host is final.
    return failure(
      id,
      state === null || state === 'connecting' ? 'phone_unavailable' : 'unavailable'
    )
  }

  function findLive(key: string): {
    hostId: string
    kind: 'chat' | 'term'
    id: string
    workspaceId?: string
  } | null {
    const sources = handlers.sources()
    const chat = sources.chats.find(
      (session) => watchSessionKey(session.hostId, 'chat', session.sessionId) === key
    )
    if (chat) {
      return {
        hostId: chat.hostId,
        kind: 'chat',
        id: chat.sessionId,
        workspaceId: chat.workspaceId
      }
    }
    const terminal = sources.terminals.find(
      (session) =>
        !session.structuredHostOwned &&
        watchSessionKey(session.hostId, 'term', session.paneKey) === key
    )
    if (terminal) {
      return {
        hostId: terminal.hostId,
        kind: 'term',
        id: terminal.paneKey,
        workspaceId: terminal.workspaceId
      }
    }
    return null
  }

  async function execute(command: WatchCommand): Promise<WatchReply> {
    if (command.type === 'refresh') {
      const snapshot = current()
      emit(snapshot, true)
      return success(command.id, snapshot)
    }
    if (command.type === 'openOnPhone') {
      const parsed = parseWatchSessionKey(command.sessionKey)
      if (!parsed) {
        return failure(command.id, 'invalid')
      }
      const live = findLive(command.sessionKey)
      handlers.openSession({
        hostId: parsed.hostId,
        kind: parsed.kind,
        id: parsed.id,
        ...(live?.workspaceId ? { workspaceId: live.workspaceId } : {}),
        ...(parsed.kind === 'term' ? { paneKey: parsed.id } : {})
      })
      return success(command.id, current())
    }
    if (command.type === 'respond') {
      const blocked = hostReady(command.hostId, command.id)
      if (blocked) {
        return blocked
      }
      const result = await handlers.respond(command.hostId, {
        promptId: command.promptId,
        optionId: command.optionId,
        clientOperationId: command.id
      })
      return result.ok ? success(command.id, current()) : failure(command.id, result.reason)
    }
    const live = findLive(command.sessionKey)
    if (!live) {
      return failure(command.id, 'not_found')
    }
    const blocked = hostReady(live.hostId, command.id)
    if (blocked) {
      return blocked
    }
    if (live.kind === 'chat') {
      const result = await handlers.sendChat(live.hostId, live.id, command.text, command.id)
      if (result.outcome === 'accepted' || result.outcome === 'queued') {
        return success(command.id, current())
      }
      return failure(
        command.id,
        result.outcome === 'rejected' ? 'rejected' : 'unavailable',
        result.detail
      )
    }
    // session.tabs.list resolves the handle. worktree.ps does not carry one.
    const accepted = await handlers.sendTerminal(
      live.hostId,
      { workspaceId: live.workspaceId, paneKey: live.id },
      command.text
    )
    return accepted ? success(command.id, current()) : failure(command.id, 'unavailable')
  }

  return {
    publish() {
      emit(current(), false)
    },
    handleCommand(raw: unknown): Promise<WatchReply> {
      const parsed = watchCommandSchema.safeParse(raw)
      if (!parsed.success) {
        return Promise.resolve(failure(commandId(raw), 'invalid'))
      }
      return dedupe.run(parsed.data.id, () => execute(parsed.data))
    },
    stop() {
      cancelScheduledPush()
    }
  }
}

export type WatchGatewayController = ReturnType<typeof createWatchGatewayController>

export type { WatchSnapshotChat, WatchSnapshotTerminal }
