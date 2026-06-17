import type { RuntimeTerminalRead } from '../../shared/runtime-types'
import {
  emptyTerminalTailState,
  type TerminalStream,
  type TerminalTailState
} from './terminal-stream'
import type { TuiRpcClient } from './tui-rpc-client'

/** Bound the in-memory tail; the host owns the authoritative bounded buffer, so
 *  the TUI only keeps a window for rendering. */
const MAX_LINES = 2000
const DEFAULT_INTERVAL_MS = 700

export type TerminalReadTailStreamOptions = {
  intervalMs?: number
  limit?: number
  /** Whether the runtime is remote; gates the degraded-fallback heuristic. */
  isRemote?: boolean
  setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
}

/** v1 TerminalStream: polls `terminal.read` with cursor paging so each tick
 *  fetches only new lines (no duplication). Works on local and remote
 *  transports; a remote PTY with no main-owned snapshot surfaces as degraded
 *  rather than faking output. A future binary-streaming impl satisfies the same
 *  contract. */
export class TerminalReadTailStream implements TerminalStream {
  private readonly client: TuiRpcClient
  private readonly handle: string
  private readonly intervalMs: number
  private readonly limit: number | undefined
  private readonly isRemote: boolean
  private readonly setTimer: NonNullable<TerminalReadTailStreamOptions['setTimer']>
  private readonly clearTimer: NonNullable<TerminalReadTailStreamOptions['clearTimer']>

  private state: TerminalTailState
  private cursor: string | null = null
  private receivedAnyLine = false
  private readonly listeners = new Set<(state: TerminalTailState) => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(client: TuiRpcClient, handle: string, options: TerminalReadTailStreamOptions = {}) {
    this.client = client
    this.handle = handle
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
    this.limit = options.limit
    this.isRemote = options.isRemote ?? false
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms))
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle))
    this.state = emptyTerminalTailState(handle)
  }

  getState(): TerminalTailState {
    return this.state
  }

  subscribe(listener: (state: TerminalTailState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async refreshOnce(): Promise<void> {
    try {
      const { result } = await this.client.call<RuntimeTerminalRead>('terminal.read', {
        terminal: this.handle,
        cursor: this.cursor ?? undefined,
        limit: this.limit
      })
      // Cursor paging returns only lines newer than `cursor`, so appending can
      // never duplicate previously-seen output.
      const lines =
        result.tail.length > 0 ? [...this.state.lines, ...result.tail] : this.state.lines
      const bounded = lines.length > MAX_LINES ? lines.slice(-MAX_LINES) : lines
      if (result.tail.length > 0) {
        this.receivedAnyLine = true
      }
      this.cursor = result.nextCursor
      this.setState({
        handle: this.handle,
        lines: bounded,
        status: result.status,
        truncated: result.truncated,
        connected: true,
        // A remote PTY with no main-owned snapshot reports unknown with no
        // content; show a degraded fallback instead of pretending it's empty.
        degraded: this.isRemote && result.status === 'unknown' && !this.receivedAnyLine
      })
    } catch {
      this.setState({ ...this.state, connected: false })
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

  private async tick(): Promise<void> {
    if (!this.running) {
      return
    }
    await this.refreshOnce()
    // Stop polling an exited terminal; its output won't change.
    if (!this.running || this.state.status === 'exited') {
      return
    }
    this.timer = this.setTimer(() => void this.tick(), this.intervalMs)
  }

  private setState(next: TerminalTailState): void {
    this.state = next
    for (const listener of this.listeners) {
      listener(next)
    }
  }
}
