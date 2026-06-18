import { TerminalAnsiSource, emptyAnsiFrame, type TerminalAnsiFrame } from './terminal-ansi-source'
import { terminalLineCount } from './viewport-frame'
import { sendTerminalKeys } from './action-dispatch'
import type { TuiRpcClient } from './tui-rpc-client'
import type { SessionTab } from './session-tab'

/** terminal.updateViewport viewport bounds (runtime schema). */
const FIT_MIN_COLS = 20
const FIT_MAX_COLS = 240
const FIT_MIN_ROWS = 8
const FIT_MAX_ROWS = 120

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function plainFrame(content: string): TerminalAnsiFrame {
  return {
    data: null,
    cols: 0,
    rows: 0,
    plainLines: content.split('\n'),
    connected: true,
    plainFallback: true
  }
}

/** Owns the focused tab: which tab is shown, the content frame it renders, the
 *  scroll offset, and (for terminals) input focus. Terminal tabs poll readAnsi
 *  live; file/markdown tabs read their content once; browser tabs show a URL —
 *  so the viewport can render any tab kind, not just terminals. */
export class FocusedTerminalPane {
  private tab: SessionTab | null = null
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

  /** The focused tab's id (for highlighting the active tab). */
  get tabId(): string | null {
    return this.tab?.id ?? null
  }

  /** The focused terminal handle, when the tab is a terminal (for input/fit). */
  get handle(): string | null {
    return this.tab?.kind === 'terminal' ? this.tab.terminalHandle : null
  }

  get viewport(): TerminalAnsiFrame {
    return this.frame
  }

  get scrollOffset(): number {
    return this.scrollback
  }

  get focused(): boolean {
    return this.inputFocused
  }

  setTab(tab: SessionTab | null): void {
    if (tab?.id === this.tab?.id) {
      return
    }
    this.tab = tab
    this.scrollback = 0
    this.fitCols = 0
    this.fitRows = 0
    if (!tab) {
      this.inputFocused = false
    }
    this.source?.stop()
    this.source = null
    this.frame = emptyAnsiFrame()
    this.loadContent(tab)
    this.onChange()
  }

  /** Start the live readAnsi poll for a terminal tab, or fetch static content
   *  for a file/markdown/browser tab. */
  private loadContent(tab: SessionTab | null): void {
    if (!tab) {
      return
    }
    if (tab.kind === 'terminal') {
      if (!tab.terminalHandle) {
        return
      }
      const source = new TerminalAnsiSource(this.client, tab.terminalHandle)
      source.subscribe((frame) => {
        this.frame = frame
        this.onChange()
      })
      source.start()
      this.source = source
      return
    }
    if (tab.kind === 'browser') {
      this.frame = plainFrame(
        `URL: ${tab.url ?? '(unknown)'}\n\n(browser tabs open in the Orca app)`
      )
      return
    }
    this.fetchFile(tab)
  }

  /** Read a file/markdown tab's content once and show it (newest content wins if
   *  the focused tab hasn't changed since the request). */
  private fetchFile(tab: SessionTab): void {
    if (!tab.relativePath) {
      this.frame = plainFrame(`(no source path for ${tab.title})`)
      return
    }
    void this.client
      .call<{ content?: string }>('files.read', {
        worktree: `id:${tab.worktreeId}`,
        relativePath: tab.relativePath
      })
      .then(({ result }) => {
        if (this.tab?.id === tab.id) {
          this.frame = plainFrame(result.content ?? '')
          this.onChange()
        }
      })
      .catch(() => {
        if (this.tab?.id === tab.id) {
          this.frame = plainFrame(`(could not read ${tab.relativePath})`)
          this.onChange()
        }
      })
  }

  cycle(tabs: readonly SessionTab[]): void {
    if (tabs.length === 0) {
      return
    }
    const current = tabs.findIndex((tab) => tab.id === this.tab?.id)
    this.setTab(tabs[(current + 1) % tabs.length])
  }

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
    const handle = this.handle
    if (handle) {
      void sendTerminalKeys(this.client, handle, data)
    }
  }

  /** Resize the focused PTY to the viewport (terminal tabs only) via the desktop
   *  updateViewport path — no input-floor side effect. No-op when unchanged. */
  fit({ cols, rows }: { cols: number; rows: number }): void {
    const handle = this.handle
    const c = clamp(cols, FIT_MIN_COLS, FIT_MAX_COLS)
    const r = clamp(rows, FIT_MIN_ROWS, FIT_MAX_ROWS)
    if (!handle || (c === this.fitCols && r === this.fitRows)) {
      return
    }
    this.fitCols = c
    this.fitRows = r
    void this.client
      .call('terminal.updateViewport', {
        terminal: handle,
        client: { id: 'orca-tui', type: 'desktop' },
        viewport: { cols: c, rows: r }
      })
      .catch(() => {
        // Older runtimes lack updateViewport; the pane still clips to width.
      })
  }

  stop(): void {
    this.source?.stop()
  }
}
