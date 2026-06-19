// Crash/restart supervision policy for plugin backend processes — the pure
// decision half of the runtime (the real `child_process` fork is wired and
// integration-tested separately). Decides whether a plugin that exited should
// be restarted (with backoff) or marked Errored after too many crashes.
//
// Pure + deterministic: callers own the actual timers and spawning; this just
// tracks per-plugin state and returns decisions.

export type RunState = 'inactive' | 'running' | 'errored'

export type ExitInfo = {
  // Clean exit from a host-initiated deactivate vs. an unexpected crash.
  crashed: boolean
}

export type RestartDecision =
  | { restart: true; delayMs: number; attempt: number }
  | { restart: false; state: RunState }

export type SupervisionConfig = {
  maxRestarts: number
  // Backoff schedule indexed by attempt; the last entry is reused past its end.
  backoffMs: number[]
}

const DEFAULT_CONFIG: SupervisionConfig = {
  maxRestarts: 3,
  backoffMs: [500, 2000, 5000]
}

type Entry = { state: RunState; restarts: number }

export class PluginSupervisor {
  private readonly entries = new Map<string, Entry>()
  private readonly config: SupervisionConfig

  constructor(config: Partial<SupervisionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  getState(id: string): RunState {
    return this.entries.get(id)?.state ?? 'inactive'
  }

  restartCount(id: string): number {
    return this.entries.get(id)?.restarts ?? 0
  }

  // Mark a plugin as running. A fresh activation (not a restart) resets the
  // crash counter so a previously-flaky plugin gets a clean slate.
  markRunning(id: string, options: { resetRestarts?: boolean } = {}): void {
    const prior = this.entries.get(id)
    this.entries.set(id, {
      state: 'running',
      restarts: options.resetRestarts ? 0 : (prior?.restarts ?? 0)
    })
  }

  // Record that the process exited and decide what to do next.
  markExited(id: string, info: ExitInfo): RestartDecision {
    if (!info.crashed) {
      // Host-initiated stop: go inactive, clear restart history.
      this.entries.set(id, { state: 'inactive', restarts: 0 })
      return { restart: false, state: 'inactive' }
    }
    const entry = this.entries.get(id) ?? { state: 'running', restarts: 0 }
    if (entry.restarts >= this.config.maxRestarts) {
      this.entries.set(id, { state: 'errored', restarts: entry.restarts })
      return { restart: false, state: 'errored' }
    }
    const attempt = entry.restarts + 1
    const idx = Math.min(entry.restarts, this.config.backoffMs.length - 1)
    this.entries.set(id, { state: 'running', restarts: attempt })
    return { restart: true, delayMs: this.config.backoffMs[idx], attempt }
  }

  // Clear all state for a plugin (e.g. on deactivate/remove or manual re-enable).
  reset(id: string): void {
    this.entries.delete(id)
  }
}

export { DEFAULT_CONFIG }
