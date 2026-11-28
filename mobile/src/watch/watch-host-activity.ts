import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { subscribeAccountsSnapshots } from '../accounts/accounts-snapshot-stream'
import { hostConnectionEpoch } from '../query/host-status-query'
import { subscribeSharedClientEvents } from '../transport/connection/shared-client-events'
import { watchAccountUsage } from './watch-account-usage'
import { readWatchBotActivity } from './watch-bot-activity'
import type { WatchUsage } from './watch-contract'

const ACTIVITY_POLL_MS = 60_000
const ACTIVITY_READ_GAP_MS = 2_000

export type WatchHostActivity = NonNullable<Awaited<ReturnType<typeof readWatchBotActivity>>>

export function startWatchHostActivity({
  client,
  hostId,
  now,
  onActivity,
  onUsage
}: {
  client: RpcClient
  hostId: string
  now: () => number
  onActivity: (activity: WatchHostActivity) => void
  onUsage: (usage: WatchUsage[]) => void
}): () => void {
  let stopped = false
  let lastActivityRead = -Infinity
  let readingActivity = false
  let activityQueued = false
  let activityTimer: ReturnType<typeof setTimeout> | undefined
  let stopAccounts: (() => void) | undefined
  const requestActivity = () => {
    if (stopped || client.getState() !== 'connected' || activityTimer !== undefined) {
      return
    }
    if (readingActivity) {
      activityQueued = true
      return
    }
    const wait = lastActivityRead + ACTIVITY_READ_GAP_MS - now()
    if (wait > 0) {
      activityTimer = setTimeout(() => {
        activityTimer = undefined
        requestActivity()
      }, wait)
      return
    }
    readingActivity = true
    lastActivityRead = now()
    const epoch = hostConnectionEpoch(client)
    const current = () =>
      !stopped && client.getState() === 'connected' && hostConnectionEpoch(client) === epoch
    void readWatchBotActivity(client, hostId, now(), current)
      .then((next) => {
        if (next && current()) {
          onActivity(next)
        }
      })
      .catch(() => {})
      .finally(() => {
        readingActivity = false
        if (activityQueued) {
          activityQueued = false
          requestActivity()
        }
      })
  }
  const acceptUsage = (next: WatchUsage[]) => {
    if (!stopped && client.getState() === 'connected') {
      onUsage(next)
    }
  }
  const wireActivity = () => {
    if (client.getState() !== 'connected') {
      stopAccounts?.()
      stopAccounts = undefined
      return
    }
    stopAccounts ??= subscribeAccountsSnapshots(client, {
      onSnapshot: (snapshot) => acceptUsage(watchAccountUsage(hostId, snapshot)),
      onInvalidSnapshot: () => acceptUsage([]),
      onStreamError: () => {}
    })
    requestActivity()
  }
  const stopEvents = subscribeSharedClientEvents(client, (event) => {
    if (event.type === 'botsChanged' || (event.type === 'ready' && 'replayed' in event)) {
      requestActivity()
    }
  })
  const stopState = client.onStateChange(wireActivity)
  const activityPoll = setInterval(requestActivity, ACTIVITY_POLL_MS)
  wireActivity()
  return () => {
    stopped = true
    clearInterval(activityPoll)
    clearTimeout(activityTimer)
    stopAccounts?.()
    stopEvents()
    stopState()
  }
}
