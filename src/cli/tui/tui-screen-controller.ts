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
import { groupTerminalsByWorktree } from './terminals-by-worktree'
import { DoubleEscapeDetector } from './double-escape'

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
  /** All terminals grouped by worktree (one terminal.list poll), the source for
   *  both the right-pane tabs and the nested sidebar tab lines. */
  private terminalsByWorktree = new Map<string, TerminalRef[]>()
  private tabsExpanded = true
  private narrow: NarrowView = 'list'
  private overlay: ControllerOverlay = { kind: 'none' }
  private input = ''
  private error: string | null = null
  private readonly pane: FocusedTerminalPane

  private size = { columns: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 }
  private readonly indicators = new IndicatorDebounceMap()

  private loadToken = 0
  private renderQueued = false
  private resolveExit: (() => void) | null = null
  private disposed = false
  private readonly doubleEsc = new DoubleEscapeDetector()

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
      void this.loadAllTerminals()
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
    terminals: () => this.selectedTerminals(),
    terminalsByWorktree: () => this.terminalsByWorktree,
    tabsExpanded: () => this.tabsExpanded,
    focusedHandle: () => this.pane.handle,
    overlay: () => this.overlay,
    inputValue: () => this.input,
    terminalFocused: () => this.inputFocused(),
    focusTerminal: () => this.focusTerminal(),
    exitTerminalFocus: () => this.exitTerminalFocus(),
    scrollTerminal: (delta) => this.pane.scroll(delta),
    toggleTabs: () => {
      this.tabsExpanded = !this.tabsExpanded
      this.render()
    },
    jumpToTab: (index, handle) => this.jumpToTab(index, handle),
    selectIndex: (index) => this.selectIndex(index),
    move: (delta) =>
      this.selectIndex(moveSelection(this.selectedIndex, delta, this.worktreeRows().length)),
    setNarrowView: (view) => {
      this.narrow = view
      this.render()
    },
    setFocused: (handle) => this.pane.setHandle(handle),
    cycleFocus: () => this.pane.cycle(this.selectedTerminals()),
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
      // Ctrl-] (matched even when batched) or a double-Esc returns to nav.
      if (data.includes(FOCUS_ESCAPE) || this.doubleEsc.test(data, Date.now())) {
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
    this.selectedIndex = clampSelection(this.selectedIndex, this.worktreeRows().length)
    void this.loadAllTerminals()
    this.render()
  }

  private worktreeRows(): WorktreeRow[] {
    return this.snap.snapshot ? flattenWorktreeRows(this.snap.snapshot) : []
  }

  /** The selected worktree's terminals (right-pane tabs), capped at MAX_PANES. */
  private selectedTerminals(): TerminalRef[] {
    const id = this.worktreeRows()[this.selectedIndex]?.worktreeId
    return (id ? this.terminalsByWorktree.get(id) : undefined)?.slice(0, MAX_PANES) ?? []
  }

  /** Poll every terminal once and group by worktree, then make sure the focused
   *  handle still belongs to the selected worktree. */
  private async loadAllTerminals(): Promise<void> {
    const token = ++this.loadToken
    try {
      const list = await this.options.client.call<RuntimeTerminalListResult>('terminal.list', {})
      if (token !== this.loadToken) {
        return
      }
      this.terminalsByWorktree = groupTerminalsByWorktree(list.result.terminals)
    } catch {
      // Keep the last map on a transient failure; the next poll re-syncs.
    }
    this.ensureFocusedHandle()
    this.render()
  }

  /** Keep the pane's handle pointing at a terminal of the selected worktree
   *  (default the first), or null when it has none. */
  private ensureFocusedHandle(): void {
    const refs = this.selectedTerminals()
    if (!refs.some((ref) => ref.handle === this.pane.handle)) {
      this.pane.setHandle(refs[0]?.handle ?? null)
    }
  }

  private jumpToTab(index: number, handle: string): void {
    this.selectIndex(index)
    this.pane.setHandle(handle)
    this.focusTerminal()
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
    this.ensureFocusedHandle()
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
      tabs: this.selectedTerminals(),
      terminalsByWorktree: this.terminalsByWorktree,
      tabsExpanded: this.tabsExpanded,
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
