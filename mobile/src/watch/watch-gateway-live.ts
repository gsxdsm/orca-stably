import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { isRpcDeliveryUnknown } from '../transport/rpc/rpc-delivery-ambiguity'
import { isLogicalClientCutoverError } from '../transport/connection/logical-client-cutover-error'
import { mobileStructuredSessionStatusFeed } from '../session/native-chat/agent-session/mobile-structured-session-status-feed'
import type {
  WatchFeedItem,
  WatchHost,
  WatchReply,
  WatchSnapshot,
  WatchUsage
} from './watch-contract'
import { startWatchHostActivity, type WatchHostActivity } from './watch-host-activity'
import { agentPromptRespond } from './watch-agent-prompt-operations'
import { createWatchGatewayController, type WatchGatewayController } from './watch-gateway'
import {
  assembleWatchSources,
  readWatchPrompts,
  readWatchWorktrees,
  watchFeedItemFromNotification,
  type WatchStoredPrompt,
  type WatchWorktreeRow
} from './watch-host-snapshot-read'
import { sendWatchStructuredChat } from './watch-structured-chat-send'
import { sendWatchTerminalText } from './watch-terminal-send'

export type WatchLiveHost = WatchHost & { client: RpcClient }

const FEED_MEMORY = 40

export function startWatchGateway(options: {
  now?: () => number
  push: (snapshot: WatchSnapshot) => void
  sendReply: (replyToken: string, reply: WatchReply) => void
  subscribeCommands: (
    onCommand: (event: { replyToken: string; command: unknown }) => void
  ) => () => void
  openSession: (target: {
    hostId: string
    kind: 'chat' | 'term'
    id: string
    workspaceId?: string
    paneKey?: string
  }) => void
}): {
  setHosts: (hosts: readonly WatchLiveHost[]) => void
  stop: () => void
} {
  const now = options.now ?? Date.now
  const hosts = new Map<string, WatchLiveHost>()
  const rows = new Map<string, WatchWorktreeRow[]>()
  const prompts = new Map<string, WatchStoredPrompt[]>()
  const feed: WatchFeedItem[] = []
  const activity = new Map<string, WatchHostActivity>()
  const usage = new Map<string, WatchUsage[]>()
  const stops = new Map<string, () => void>()
  let controller: WatchGatewayController

  function sources() {
    const entries = [...activity.values()]
    return {
      ...assembleWatchSources({ hosts: hosts.values(), rows, prompts, feed }),
      bots: entries.flatMap((entry) => entry.bots),
      needsYou: entries.flatMap((entry) => entry.needsYou),
      usage: [...usage.values()].flat()
    }
  }

  controller = createWatchGatewayController({
    now,
    hosts: () =>
      [...hosts.values()].map(({ hostId, name, connection }) => ({ hostId, name, connection })),
    sources,
    schedule: (delayMs, run) => {
      const timer = setTimeout(run, delayMs)
      return () => clearTimeout(timer)
    },
    push: options.push,
    openSession: options.openSession,
    async respond(hostId, input) {
      const client = hosts.get(hostId)?.client
      if (!client) {
        return { ok: false, reason: 'unavailable' }
      }
      try {
        const response = await agentPromptRespond.request(client, input, {
          timeoutMs: 17_000,
          budgetSpansConnect: true
        })
        const result = agentPromptRespond.interpret(response)
        const cached = prompts.get(hostId)
        if (result?.ok && cached && hosts.get(hostId)?.client === client) {
          prompts.set(
            hostId,
            cached.filter((prompt) => prompt.promptId !== input.promptId)
          )
        }
        return result ?? { ok: false, reason: 'unavailable' }
      } catch (error) {
        return {
          ok: false,
          reason:
            isRpcDeliveryUnknown(error) || isLogicalClientCutoverError(error)
              ? 'unknown'
              : 'unavailable'
        }
      }
    },
    async sendChat(hostId, sessionId, text) {
      const client = hosts.get(hostId)?.client
      if (!client) {
        return { outcome: 'unavailable' }
      }
      return sendWatchStructuredChat({ client, sessionId, text })
    },
    async sendTerminal(hostId, target, text) {
      const client = hosts.get(hostId)?.client
      if (!client || !target.workspaceId) {
        return { outcome: 'unavailable' }
      }
      return sendWatchTerminalText({
        client,
        worktreeId: target.workspaceId,
        paneKey: target.paneKey,
        text
      })
    }
  })

  function rememberFeed(hostId: string, data: unknown) {
    const item = watchFeedItemFromNotification(hostId, data, now())
    if (!item) {
      return
    }
    feed.push(item)
    if (feed.length > FEED_MEMORY) {
      feed.splice(0, feed.length - FEED_MEMORY)
    }
    controller.publish()
  }

  async function refreshHost(host: WatchLiveHost) {
    const [nextRows, nextPrompts] = await Promise.all([
      readWatchWorktrees(host.client),
      readWatchPrompts(host.client, host.hostId)
    ])
    if (hosts.get(host.hostId)?.client !== host.client) {
      return
    }
    rows.set(host.hostId, nextRows)
    prompts.set(host.hostId, nextPrompts)
    controller.publish()
  }

  function watchHost(host: WatchLiveHost): () => void {
    let stopped = false
    let refreshQueued = false
    let refreshing = false
    const pump = () => {
      if (stopped || refreshing) {
        refreshQueued = !stopped
        return
      }
      refreshing = true
      void refreshHost(host).finally(() => {
        refreshing = false
        if (refreshQueued && !stopped) {
          refreshQueued = false
          pump()
        }
      })
    }
    const status = mobileStructuredSessionStatusFeed(host.client)
    const stopStatus = status.subscribe(() => {
      controller.publish()
      pump()
    })
    const stopNotes = host.client.subscribe(
      'notifications.subscribe',
      { includeDesktopSuppressed: true },
      (data) => {
        rememberFeed(host.hostId, data)
        pump()
      }
    )
    const poll = setInterval(pump, 5_000)
    const stopActivity = startWatchHostActivity({
      client: host.client,
      hostId: host.hostId,
      now,
      onActivity: (next) => {
        activity.set(host.hostId, next)
        controller.publish()
      },
      onUsage: (next) => {
        usage.set(host.hostId, next)
        controller.publish()
      }
    })
    pump()
    return () => {
      stopped = true
      clearInterval(poll)
      stopActivity()
      stopStatus()
      stopNotes()
    }
  }

  const stopCommands = options.subscribeCommands((event) => {
    void controller.handleCommand(event.command).then(
      (reply) => options.sendReply(event.replyToken, reply),
      () =>
        options.sendReply(event.replyToken, {
          v: 1,
          id: 'invalid',
          ok: false,
          reason: 'unavailable'
        })
    )
  })

  return {
    setHosts(next) {
      const seen = new Set<string>()
      for (const host of next) {
        seen.add(host.hostId)
        const previous = hosts.get(host.hostId)
        hosts.set(host.hostId, host)
        if (previous?.client !== host.client) {
          stops.get(host.hostId)?.()
          rows.delete(host.hostId)
          prompts.delete(host.hostId)
          activity.delete(host.hostId)
          usage.delete(host.hostId)
          stops.set(host.hostId, watchHost(host))
        } else if (previous.connection !== host.connection || previous.name !== host.name) {
          controller.publish()
        }
      }
      for (const hostId of hosts.keys()) {
        if (!seen.has(hostId)) {
          stops.get(hostId)?.()
          stops.delete(hostId)
          hosts.delete(hostId)
          rows.delete(hostId)
          prompts.delete(hostId)
          activity.delete(hostId)
          usage.delete(hostId)
        }
      }
      controller.publish()
    },
    stop() {
      stopCommands()
      for (const stop of stops.values()) {
        stop()
      }
      stops.clear()
      controller.stop()
    }
  }
}
