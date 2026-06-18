import { TerminalAnsiSource, emptyAnsiFrame, type TerminalAnsiFrame } from './terminal-ansi-source'
import { terminalLineCount } from './viewport-frame'
import { sendTerminalKeys } from './action-dispatch'
import type { TuiRpcClient } from './tui-rpc-client'
import type { TerminalRef } from './tui-input'

/** Client id under which the TUI registers its viewport fit; `restore` releases
 *  it so the desktop view returns to its own size. */
const FIT_CLIENT_ID = 'orca-tui'

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
  private fitCols = 0
  private fitRows = 0

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
    // Release our fit on the terminal we're leaving so its desktop view is not
    // stranded at the TUI's (smaller) size.
    this.restoreFit()
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

  /** Capture input focus. Focus is intent, not tied to a live handle: keystrokes
   *  only forward while a handle exists (see the controller), and setHandle(null)
   *  clears focus — so focusing then selecting a workspace lands on its terminal
   *  once it loads, and an empty workspace simply stays unfocused. */
  focusInput(): void {
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

  /** Resize the focused PTY to the viewport (cols × rows) so its content reflows
   *  to fit the pane — the TUI's size overrides the terminal's own. No-op when
   *  the size is unchanged. */
  fit({ cols, rows }: { cols: number; rows: number }): void {
    if (
      !this.handleId ||
      cols <= 0 ||
      rows <= 0 ||
      (cols === this.fitCols && rows === this.fitRows)
    ) {
      return
    }
    this.fitCols = cols
    this.fitRows = rows
    void this.client
      .call('terminal.resizeForClient', {
        terminal: this.handleId,
        mode: 'mobile-fit',
        cols,
        rows,
        clientId: FIT_CLIENT_ID
      })
      .catch(() => {
        // Older runtimes lack resizeForClient; the pane still clips to width.
      })
  }

  private restoreFit(): void {
    if (!this.handleId || this.fitCols === 0) {
      return
    }
    const terminal = this.handleId
    this.fitCols = 0
    this.fitRows = 0
    void this.client
      .call('terminal.resizeForClient', { terminal, mode: 'restore', clientId: FIT_CLIENT_ID })
      .catch(() => {})
  }

  stop(): void {
    this.restoreFit()
    this.source?.stop()
  }
}
