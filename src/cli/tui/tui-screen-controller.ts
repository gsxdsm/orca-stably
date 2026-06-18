import {
  ALT_SCREEN_ENTER,
  ALT_SCREEN_LEAVE,
  AUTOWRAP_OFF,
  AUTOWRAP_ON,
  CLEAR_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR
} from './ansi-control'
import { MOUSE_DISABLE, MOUSE_ENABLE, parseMouseEvents } from './mouse-input'
import { decodeKey } from './tty-key-adapter'
import { ScreenCompositor } from './screen-compositor'
import { composeFrame, type FrameModel } from './compose-frame'
import { contextLabel, toOverlayModel } from './frame-derivation'
import {
  handleKey,
  handleMouse,
  type ControllerHost,
  type ControllerOverlay,
  type TerminalRef
} from './tui-input'
import { WorktreeSnapshotSource, type WorktreeSnapshotState } from './worktree-snapshot-source'
import { flattenWorktreeRows, type WorktreeRow } from './worktree-snapshot'
import { FocusedTerminalPane } from './focused-terminal-pane'
import { dispatchAction, type TuiCommand } from './action-dispatch'

/** Telnet-style escape (Ctrl-]) returns from terminal-input focus to navigation;
 *  it's effectively unused by interactive programs, so it won't clash with what
 *  we're forwarding to the PTY. */
const FOCUS_ESCAPE = '\x1d'
import { IndicatorDebounceMap } from './indicator-debounce-map'
import { clampSelection, moveSelection } from './navigation-state'
import { MAX_PANES } from './pane-layout'
import { currentPlatform } from './keybinding-map'
import { resolveTheme } from './theme'
import {
  HEADER_ROWS,
  NARROW_THRESHOLD,
  sidebarWidthFor,
  viewportCellDims,
  type NarrowView
} from './tui-layout'
import type { RunTuiOptions } from './tui-runtime-contract'
import type { RuntimeTerminalListResult } from '../../shared/runtime-types'

/** The manual screen controller: owns the terminal directly (herdr-style) and
 *  drives a diff-based compositor instead of Ink, so the right pane can carry
 *  the focused terminal's verbatim ANSI output. Input routing lives in
 *  ./tui-input; this class owns state, the data sources, and rendering. */
export class TuiScreenController {
  private readonly options: RunTuiOptions
  private readonly source: WorktreeSnapshotSource
  private readonly compositor: ScreenCompositor
  private readonly useColor = resolveTheme().useColor
  private readonly platform = currentPlatform()

  private snap: WorktreeSnapshotState
  private selectedIndex = 0
  private terminals: TerminalRef[] = []
  private narrow: NarrowView = 'list'
  private overlay: ControllerOverlay = { kind: 'none' }
  private input = ''
  private error: string | null = null
  private readonly pane: FocusedTerminalPane

  private size = { columns: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 }
  private readonly indicators = new IndicatorDebounceMap()

  private loadedWorktreeId: string | null = null
  private loadToken = 0
  private renderQueued = false
  private resolveExit: (() => void) | null = null
  private disposed = false

  private readonly onData = (chunk: Buffer | string): void => this.handleStdin(chunk)
  private readonly onResize = (): void => this.handleResize()

  constructor(options: RunTuiOptions) {
    this.options = options
    this.source = new WorktreeSnapshotSource(options.client)
    this.compositor = new ScreenCompositor()
    this.snap = this.source.getState()
    this.pane = new FocusedTerminalPane(options.client, () => this.render())
  }

  run(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolveExit = resolve
      process.stdout.write(
        ALT_SCREEN_ENTER + HIDE_CURSOR + AUTOWRAP_OFF + MOUSE_ENABLE + CLEAR_SCREEN
      )
      const stdin = process.stdin
      if (stdin.isTTY) {
        stdin.setRawMode?.(true)
      }
      stdin.resume()
      stdin.on('data', this.onData)
      process.stdout.on('resize', this.onResize)
      this.source.subscribe((state) => this.handleSnapshot(state))
      this.source.start()
      this.render()
    })
  }

  // ─── Host bridge for ./tui-input ─────────────────────────────────────────

  private readonly host: ControllerHost = {
    worktreeRows: () => this.worktreeRows(),
    selected: () => this.selected(),
    selectedIndex: () => this.selectedIndex,
    isNarrow: () => this.isNarrow(),
    narrowView: () => this.narrow,
    sidebarWidth: () => this.sidebarWidth(),
    bodyHeight: () => this.bodyHeight(),
    snapshot: () => this.snap.snapshot,
    resolveKind: (row) => this.indicators.kindFor(row),
    terminals: () => this.terminals,
    focusedHandle: () => this.pane.handle,
    overlay: () => this.overlay,
    inputValue: () => this.input,
    terminalFocused: () => this.inputFocused(),
    focusTerminal: () => this.focusTerminal(),
    exitTerminalFocus: () => this.exitTerminalFocus(),
    scrollTerminal: (delta) => this.pane.scroll(delta),
    selectIndex: (index) => this.selectIndex(index),
    move: (delta) =>
      this.selectIndex(moveSelection(this.selectedIndex, delta, this.worktreeRows().length)),
    setNarrowView: (view) => {
      this.narrow = view
      this.render()
    },
    setFocused: (handle) => this.pane.setHandle(handle),
    cycleFocus: () => this.pane.cycle(this.terminals),
    setOverlay: (overlay) => {
      this.overlay = overlay
      this.render()
    },
    setInput: (value) => {
      this.input = value
      this.render()
    },
    runCommand: (command) => void this.runCommand(command),
    refresh: () => void this.source.refreshOnce(),
    quit: () => this.quit()
  }

  private handleStdin(chunk: Buffer | string): void {
    const data = chunk.toString()
    const mouse = parseMouseEvents(data)
    if (mouse.length > 0) {
      mouse.forEach((event) => handleMouse(this.host, event))
      return
    }
    // While the terminal is focused, forward raw keystrokes to the PTY verbatim
    // (so escapes/control chars pass through); Ctrl-] is the way back to nav.
    if (this.inputFocused()) {
      if (data === FOCUS_ESCAPE) {
        this.exitTerminalFocus()
      } else {
        this.pane.sendKeys(data)
      }
      return
    }
    const key = decodeKey(data)
    if (key) {
      handleKey(this.host, key)
    }
  }

  // ─── Snapshot + selection ──────────────────────────────────────────────────

  private handleSnapshot(state: WorktreeSnapshotState): void {
    this.snap = state
    if (this.snap.snapshot) {
      this.indicators.reconcile(this.worktreeRows(), Date.now())
    }
    this.syncSelectedWorktree()
    this.render()
  }

  private worktreeRows(): WorktreeRow[] {
    return this.snap.snapshot ? flattenWorktreeRows(this.snap.snapshot) : []
  }

  private syncSelectedWorktree(): void {
    const rows = this.worktreeRows()
    this.selectedIndex = clampSelection(this.selectedIndex, rows.length)
    const id = rows[this.selectedIndex]?.worktreeId ?? null
    if (id === this.loadedWorktreeId) {
      return
    }
    this.loadedWorktreeId = id
    this.loadTerminals(id)
  }

  private loadTerminals(worktreeId: string | null): void {
    const token = ++this.loadToken
    if (!worktreeId) {
      this.setTerminals([])
      return
    }
    void (async () => {
      try {
        const list = await this.options.client.call<RuntimeTerminalListResult>('terminal.list', {
          worktree: `id:${worktreeId}`
        })
        if (token === this.loadToken) {
          this.setTerminals(
            list.result.terminals.slice(0, MAX_PANES).map((terminal) => ({
              handle: terminal.handle,
              title: terminal.title && terminal.title.length > 0 ? terminal.title : 'shell'
            }))
          )
        }
      } catch {
        if (token === this.loadToken) {
          this.setTerminals([])
        }
      }
    })()
  }

  private setTerminals(terminals: TerminalRef[]): void {
    this.terminals = terminals
    this.pane.setHandle(terminals[0]?.handle ?? null)
    this.render()
  }

  // ─── Terminal input focus (delegated to the pane) ──────────────────────────

  /** True when keystrokes/scroll target the terminal: the pane's explicit
   *  wide-mode focus, or implicitly whenever the narrow terminal view is open. */
  private inputFocused(): boolean {
    return this.pane.focused || (this.isNarrow() && this.narrow === 'terminal')
  }

  private focusTerminal(): void {
    this.pane.focusInput()
  }

  private exitTerminalFocus(): void {
    this.pane.exitInput()
    if (this.isNarrow()) {
      this.narrow = 'list'
    }
    this.render()
  }

  // ─── State setters + geometry ──────────────────────────────────────────────

  private selectIndex(index: number): void {
    const next = clampSelection(index, this.worktreeRows().length)
    if (next === this.selectedIndex) {
      return
    }
    this.selectedIndex = next
    this.syncSelectedWorktree()
    this.render()
  }

  private isNarrow(): boolean {
    return this.size.columns < NARROW_THRESHOLD
  }

  private sidebarWidth(): number {
    return sidebarWidthFor(this.size.columns)
  }

  private bodyHeight(): number {
    return Math.max(1, this.size.rows - HEADER_ROWS - 1)
  }

  private selected(): WorktreeRow | null {
    return this.worktreeRows()[this.selectedIndex] ?? null
  }

  private async runCommand(command: TuiCommand): Promise<void> {
    const result = await dispatchAction(this.options.client, command)
    this.error = result.ok ? null : result.error
    if (result.ok) {
      void this.source.refreshOnce()
    }
    this.render()
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  private handleResize(): void {
    this.size = { columns: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 }
    this.compositor.reset()
    this.render()
  }

  private render(): void {
    if (this.disposed || this.renderQueued) {
      return
    }
    this.renderQueued = true
    setImmediate(() => {
      this.renderQueued = false
      if (!this.disposed) {
        this.pane.fit(viewportCellDims(this.size.columns, this.bodyHeight(), this.isNarrow()))
        this.compositor.render(composeFrame(this.frameModel()))
      }
    })
  }

  private frameModel(): FrameModel {
    const rows = this.worktreeRows()
    this.selectedIndex = clampSelection(this.selectedIndex, rows.length)
    const selected = rows[this.selectedIndex] ?? null
    return {
      columns: this.size.columns,
      rows: this.size.rows,
      isNarrow: this.isNarrow(),
      narrowView: this.narrow,
      snapshot: this.snap.snapshot,
      worktreeRows: rows,
      selectedIndex: this.selectedIndex,
      selectedName: selected?.displayName ?? '',
      sidebarWidth: this.sidebarWidth(),
      tabs: this.terminals,
      focusedHandle: this.pane.handle,
      terminalFocused: this.inputFocused(),
      viewport: this.pane.viewport,
      scrollOffset: this.pane.scrollOffset,
      resolveKind: this.indicators.kindFor,
      platform: this.platform,
      context: contextLabel(selected),
      disconnected: !this.snap.connected,
      error: this.error,
      useColor: this.useColor,
      overlay: toOverlayModel(this.overlay, this.input, this.platform)
    }
  }

  private quit(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.pane.stop()
    this.source.stop()
    const stdin = process.stdin
    stdin.off('data', this.onData)
    process.stdout.off('resize', this.onResize)
    if (stdin.isTTY) {
      stdin.setRawMode?.(false)
    }
    stdin.pause()
    // Restore a visible cursor + default shape, drop mouse reporting, leave the
    // alt screen — herdr's restore postlude so a quit never strands the terminal.
    process.stdout.write(`${SHOW_CURSOR}\x1b[0 q${AUTOWRAP_ON}${MOUSE_DISABLE}${ALT_SCREEN_LEAVE}`)
    this.resolveExit?.()
  }
}
