import type { RuntimeTerminalRead, RuntimeTerminalReadAnsi } from '../../shared/runtime-types'
import { AnsiScreen } from './ansi-screen'
import { emptyScreenState, plainLinesToStyled, type TerminalScreenState } from './terminal-screen'
import type { TuiRpcClient } from './tui-rpc-client'

const DEFAULT_INTERVAL_MS = 200
const PLAIN_TAIL_LIMIT = 500

export type TerminalScreenStreamOptions = {
  intervalMs?: number
  setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
}

/** True for an error that means the runtime doesn't know `terminal.readAnsi`
 *  (e.g. an older runtime not yet rebuilt) — so we fall back to plain text. */
function looksLikeUnknownMethod(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('unknown command') ||
    message.includes('unknown method') ||
    message.includes('not supported') ||
    message.includes('not_supported') ||
    message.includes('method not found') ||
    message.includes('method_not_found') ||
    message.includes('no such method')
  )
}

/** Polls the focused terminal's ANSI screen (colors via terminal.readAnsi),
 *  falling back to the plain-text tail when the runtime can't serialize ANSI. */
export class TerminalScreenStream {
  private readonly client: TuiRpcClient
  private readonly handle: string
  private readonly intervalMs: number
  private readonly setTimer: NonNullable<TerminalScreenStreamOptions['setTimer']>
  private readonly clearTimer: NonNullable<TerminalScreenStreamOptions['clearTimer']>

  private state: TerminalScreenState = emptyScreenState()
  private readonly screen = new AnsiScreen()
  private ansiSupported = true
  private readonly listeners = new Set<(state: TerminalScreenState) => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(client: TuiRpcClient, handle: string, options: TerminalScreenStreamOptions = {}) {
    this.client = client
    this.handle = handle
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms))
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle))
  }

  getState(): TerminalScreenState {
    return this.state
  }

  subscribe(listener: (state: TerminalScreenState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async refreshOnce(): Promise<void> {
    if (this.ansiSupported) {
      try {
        const { result } = await this.client.call<{ terminal: RuntimeTerminalReadAnsi }>(
          'terminal.readAnsi',
          { terminal: this.handle }
        )
        const snapshot = result.terminal
        const lines = snapshot
          ? await this.screen.render(snapshot.data, snapshot.cols, snapshot.rows)
          : []
        this.setState({ lines, connected: true, plainFallback: false })
        return
      } catch (error) {
        // A clear unknown-method error means the runtime predates readAnsi —
        // stop trying it. For any other error, still fall through to the plain
        // tail this tick so the panel always shows output, and retry ANSI next.
        if (looksLikeUnknownMethod(error)) {
          this.ansiSupported = false
        }
      }
    }
    await this.refreshPlain()
  }

  private async refreshPlain(): Promise<void> {
    try {
      const { result } = await this.client.call<{ terminal: RuntimeTerminalRead }>(
        'terminal.read',
        {
          terminal: this.handle,
          limit: PLAIN_TAIL_LIMIT
        }
      )
      this.setState({
        lines: plainLinesToStyled(result.terminal.tail),
        connected: true,
        plainFallback: true
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
    this.screen.dispose()
  }

  private async tick(): Promise<void> {
    if (!this.running) {
      return
    }
    await this.refreshOnce()
    if (!this.running) {
      return
    }
    this.timer = this.setTimer(() => void this.tick(), this.intervalMs)
  }

  private setState(next: TerminalScreenState): void {
    this.state = next
    for (const listener of this.listeners) {
      listener(next)
    }
  }
}
