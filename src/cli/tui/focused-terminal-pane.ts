import { TerminalAnsiSource, emptyAnsiFrame, type TerminalAnsiFrame } from './terminal-ansi-source'
import { terminalLineCount } from './viewport-frame'
import { sendTerminalKeys } from './action-dispatch'
import type { TuiRpcClient } from './tui-rpc-client'
import type { TerminalRef } from './tui-input'

/** Owns the focused terminal: which handle is shown, its polled ANSI frame, the
 *  scrollback offset, and whether keystrokes are captured (wide-mode input
 *  focus). Pulled out of the controller so that file stays focused on layout and
 *  app state. Narrow-mode focus is derived by the controller from the view. */
export class FocusedTerminalPane {
  private handleId: string | null = null
  private source: TerminalAnsiSource | null = null
  private frame: TerminalAnsiFrame = emptyAnsiFrame()
  private scrollback = 0
  private inputFocused = false

  constructor(
    private readonly client: TuiRpcClient,
    private readonly onChange: () => void
  ) {}

  get handle(): string | null {
    return this.handleId
  }

  get viewport(): TerminalAnsiFrame {
    return this.frame
  }

  get scrollOffset(): number {
    return this.scrollback
  }

  /** True when wide-mode input focus is on; the controller ORs this with the
   *  narrow terminal view to decide whether keystrokes go to the PTY. */
  get focused(): boolean {
    return this.inputFocused
  }

  setHandle(handle: string | null): void {
    if (handle === this.handleId) {
      return
    }
    this.handleId = handle
    this.scrollback = 0
    if (!handle) {
      this.inputFocused = false
    }
    this.source?.stop()
    this.source = null
    this.frame = emptyAnsiFrame()
    if (handle) {
      const source = new TerminalAnsiSource(this.client, handle)
      source.subscribe((frame) => {
        this.frame = frame
        this.onChange()
      })
      source.start()
      this.source = source
    }
    this.onChange()
  }

  cycle(terminals: readonly TerminalRef[]): void {
    if (terminals.length === 0) {
      return
    }
    const current = terminals.findIndex((terminal) => terminal.handle === this.handleId)
    this.setHandle(terminals[(current + 1) % terminals.length].handle)
  }

  focusInput(hasTerminals: boolean): void {
    if (!hasTerminals) {
      return
    }
    this.inputFocused = true
    this.scrollback = 0
    this.onChange()
  }

  exitInput(): void {
    this.inputFocused = false
    this.onChange()
  }

  scroll(delta: number): void {
    const max = Math.max(0, terminalLineCount(this.frame) - 1)
    const next = Math.min(Math.max(this.scrollback + delta, 0), max)
    if (next === this.scrollback) {
      return
    }
    this.scrollback = next
    this.onChange()
  }

  sendKeys(data: string): void {
    if (this.handleId) {
      void sendTerminalKeys(this.client, this.handleId, data)
    }
  }

  stop(): void {
    this.source?.stop()
  }
}
