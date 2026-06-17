import type { RuntimeWorktreePsResult } from '../../shared/runtime-types'
import { buildHerdSnapshot, type HerdSnapshot } from './herd-view-model'

/** Minimal RPC surface the source needs. RuntimeClient satisfies this
 *  structurally; tests provide a lightweight fake without casting. */
export type HerdRpcClient = {
  call<T>(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number }
  ): Promise<{ result: T }>
}

export type HerdSnapshotState = {
  snapshot: HerdSnapshot | null
  /** True after a successful fetch; false while reconnecting/unreachable. */
  connected: boolean
  error: string | null
  lastUpdatedAt: number | null
}

export type HerdSnapshotSourceOptions = {
  intervalMs?: number
  limit?: number
  now?: () => number
  setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
}

const DEFAULT_INTERVAL_MS = 1500
const MAX_BACKOFF_MS = 15_000

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/** Polls `worktree.ps` on an interval and exposes the latest herd snapshot.
 *
 *  Cost contract: exactly ONE `worktree.ps` RPC per tick (the whole herd,
 *  including per-agent rows, comes back in a single response) — never one call
 *  per worktree, which over a remote transport would mean a fresh socket and
 *  E2EE handshake per row. */
export class HerdSnapshotSource {
  private readonly client: HerdRpcClient
  private readonly intervalMs: number
  private readonly limit: number | undefined
  private readonly now: () => number
  private readonly setTimer: NonNullable<HerdSnapshotSourceOptions['setTimer']>
  private readonly clearTimer: NonNullable<HerdSnapshotSourceOptions['clearTimer']>

  private state: HerdSnapshotState = {
    snapshot: null,
    connected: false,
    error: null,
    lastUpdatedAt: null
  }
  private readonly listeners = new Set<(state: HerdSnapshotState) => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private consecutiveFailures = 0

  constructor(client: HerdRpcClient, options: HerdSnapshotSourceOptions = {}) {
    this.client = client
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
    this.limit = options.limit
    this.now = options.now ?? (() => Date.now())
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms))
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle))
  }

  getState(): HerdSnapshotState {
    return this.state
  }

  subscribe(listener: (state: HerdSnapshotState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Fetch the herd once and update state. Resolves after the attempt whether
   *  it succeeded or failed (failures set `connected: false`, keep the last
   *  snapshot, and grow the reconnect backoff). */
  async refreshOnce(): Promise<void> {
    try {
      const response = await this.client.call<RuntimeWorktreePsResult>('worktree.ps', {
        limit: this.limit
      })
      this.consecutiveFailures = 0
      this.setState({
        snapshot: buildHerdSnapshot(response.result),
        connected: true,
        error: null,
        lastUpdatedAt: this.now()
      })
    } catch (error) {
      this.consecutiveFailures += 1
      this.setState({
        ...this.state,
        connected: false,
        error: errorMessage(error)
      })
    }
  }

  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    void this.tick()
  }

  stop(): void {
    this.running = false
    if (this.timer !== null) {
      this.clearTimer(this.timer)
      this.timer = null
    }
  }

  /** Backoff after failures so a downed runtime isn't hammered; capped. */
  private nextDelayMs(): number {
    if (this.consecutiveFailures === 0) {
      return this.intervalMs
    }
    const backoff = this.intervalMs * 2 ** Math.min(this.consecutiveFailures, 5)
    return Math.min(backoff, MAX_BACKOFF_MS)
  }

  private async tick(): Promise<void> {
    if (!this.running) {
      return
    }
    await this.refreshOnce()
    if (!this.running) {
      return
    }
    this.timer = this.setTimer(() => void this.tick(), this.nextDelayMs())
  }

  private setState(next: HerdSnapshotState): void {
    this.state = next
    for (const listener of this.listeners) {
      listener(next)
    }
  }
}
