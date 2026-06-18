import { resolveAction, type TuiAction } from './keybinding-map'
import { worktreeSelector, type TuiCommand } from './action-dispatch'
import { buildSidebarLines, rowIndexAtScreenRow } from './sidebar-lines'
import { tabHandleAtColumn, tabRegions, truncateTabLabel } from './pane-layout'
import { windowStart } from './navigation-state'
import { BACK_LABEL, HEADER_ROWS, STRIP_WIDTH, type NarrowView } from './tui-layout'
import type { MouseEvent } from './mouse-input'
import type { LogicalKey } from './tty-key-adapter'
import type { StatusIndicatorKind } from './agent-state-indicator'
import type { WorktreeRow, WorktreeSnapshot } from './worktree-snapshot'

export type TerminalRef = { handle: string; title: string }

/** Controller overlay state, including the closures that turn user input into
 *  an RPC command (kept here so the input layer owns the command-building). */
export type ControllerOverlay =
  | { kind: 'none' }
  | { kind: 'help' }
  | { kind: 'confirm'; message: string; command: TuiCommand }
  | { kind: 'prompt'; label: string; build: (text: string) => TuiCommand | null }

/** The slice of the controller the input layer reads and mutates. Keeping it an
 *  explicit interface lets key/mouse routing live outside the controller (so
 *  each file stays small) without exposing the controller's internals wholesale. */
export type ControllerHost = {
  worktreeRows: () => readonly WorktreeRow[]
  selected: () => WorktreeRow | null
  selectedIndex: () => number
  isNarrow: () => boolean
  narrowView: () => NarrowView
  sidebarWidth: () => number
  bodyHeight: () => number
  snapshot: () => WorktreeSnapshot | null
  resolveKind: (row: WorktreeRow) => StatusIndicatorKind
  terminals: () => readonly TerminalRef[]
  focusedHandle: () => string | null
  overlay: () => ControllerOverlay
  inputValue: () => string
  /** True when keystrokes/scroll target the focused terminal rather than nav. */
  terminalFocused: () => boolean
  selectIndex: (index: number) => void
  move: (delta: number) => void
  setNarrowView: (view: NarrowView) => void
  setFocused: (handle: string | null) => void
  cycleFocus: () => void
  focusTerminal: () => void
  exitTerminalFocus: () => void
  scrollTerminal: (delta: number) => void
  setOverlay: (overlay: ControllerOverlay) => void
  setInput: (value: string) => void
  runCommand: (command: TuiCommand) => void
  refresh: () => void
  quit: () => void
}

/** Lines moved per scroll-wheel tick when scrolling the focused terminal. */
const SCROLL_LINES = 3

// ─── Keyboard ────────────────────────────────────────────────────────────────

export function handleKey(host: ControllerHost, key: LogicalKey): void {
  const overlay = host.overlay()
  if (overlay.kind === 'help') {
    host.setOverlay({ kind: 'none' })
    return
  }
  if (overlay.kind === 'confirm') {
    if (key.type === 'char' && key.value === 'y') {
      host.runCommand(overlay.command)
      host.setOverlay({ kind: 'none' })
    } else if (key.type === 'escape' || (key.type === 'char' && key.value === 'n')) {
      host.setOverlay({ kind: 'none' })
    }
    return
  }
  if (overlay.kind === 'prompt') {
    routePromptKey(host, overlay, key)
    return
  }
  if (key.type === 'tab') {
    host.cycleFocus()
    return
  }
  const action = resolveAction(key)
  if (!action) {
    return
  }
  // Enter focuses the terminal for input: in narrow this opens the terminal
  // view (which is implicitly focused); in wide it captures keystrokes.
  if (action === 'open') {
    if (host.isNarrow()) {
      if (host.selected()) {
        host.setNarrowView('terminal')
      }
    } else {
      host.focusTerminal()
    }
    return
  }
  startAction(host, action)
}

function routePromptKey(
  host: ControllerHost,
  overlay: Extract<ControllerOverlay, { kind: 'prompt' }>,
  key: LogicalKey
): void {
  if (key.type === 'enter') {
    const command = overlay.build(host.inputValue())
    host.setOverlay({ kind: 'none' })
    if (command) {
      host.runCommand(command)
    }
  } else if (key.type === 'escape') {
    host.setOverlay({ kind: 'none' })
  } else if (key.type === 'backspace') {
    host.setInput(host.inputValue().slice(0, -1))
  } else if (key.type === 'char') {
    host.setInput(host.inputValue() + key.value)
  }
}

function startAction(host: ControllerHost, action: TuiAction): void {
  if (action === 'quit') {
    host.quit()
  } else if (action === 'help') {
    host.setOverlay({ kind: 'help' })
  } else if (action === 'refresh') {
    host.refresh()
  } else if (action === 'move-up') {
    host.move(-1)
  } else if (action === 'move-down') {
    host.move(1)
  } else {
    startTargetedAction(host, action)
  }
}

function startTargetedAction(host: ControllerHost, action: TuiAction): void {
  const selected = host.selected()
  if (!selected) {
    return
  }
  const wt = worktreeSelector(selected.worktreeId)
  if (action === 'activate') {
    host.runCommand({ kind: 'worktree.activate', worktree: wt })
  } else if (action === 'remove-worktree') {
    host.setOverlay({
      kind: 'confirm',
      message: `Remove worktree "${selected.displayName}"?`,
      command: { kind: 'worktree.rm', worktree: wt, force: true }
    })
  } else if (action === 'new-terminal') {
    openPrompt(host, 'New terminal command (blank for a shell):', (text) => ({
      kind: 'terminal.create',
      worktree: wt,
      command: text || undefined
    }))
  } else if (action === 'new-worktree') {
    openPrompt(host, `New worktree name (repo ${selected.repoId}):`, (text) =>
      text ? { kind: 'worktree.create', repo: `id:${selected.repoId}`, name: text } : null
    )
  }
}

function openPrompt(
  host: ControllerHost,
  label: string,
  build: (text: string) => TuiCommand | null
): void {
  host.setInput('')
  host.setOverlay({ kind: 'prompt', label, build })
}

// ─── Mouse ───────────────────────────────────────────────────────────────────

export function handleMouse(host: ControllerHost, event: MouseEvent): void {
  if (event.type === 'scroll') {
    // When the terminal is focused the wheel scrolls its history (up = older);
    // otherwise it moves the worktree selection.
    if (host.terminalFocused()) {
      host.scrollTerminal(event.direction === 'up' ? SCROLL_LINES : -SCROLL_LINES)
    } else {
      host.move(event.direction === 'down' ? 1 : -1)
    }
    return
  }
  if (event.type !== 'press' || event.button !== 'left') {
    return
  }
  if (host.isNarrow()) {
    routeNarrowMouse(host, event.col, event.row)
    return
  }
  // Wide: selecting a workspace focuses its terminal; so do the tab row and the
  // viewport body. (Ctrl-] is the way back to navigation.)
  if (event.col < host.sidebarWidth()) {
    if (selectSidebarRow(host, event.row, false)) {
      host.focusTerminal()
    }
  } else if (event.row === HEADER_ROWS) {
    focusTabAt(host, host.sidebarWidth() + 2, event.col)
    host.focusTerminal()
  } else {
    host.focusTerminal()
  }
}

function routeNarrowMouse(host: ControllerHost, col: number, row: number): void {
  if (host.narrowView() === 'list') {
    selectSidebarRow(host, row, true)
    return
  }
  if (row === 0 && col < BACK_LABEL.length) {
    host.setNarrowView('list')
    return
  }
  if (col < STRIP_WIDTH) {
    const total = host.worktreeRows().length
    const start = windowStart(host.selectedIndex(), total, host.bodyHeight())
    const index = start + (row - HEADER_ROWS)
    if (index >= 0 && index < total) {
      host.selectIndex(index)
    }
    return
  }
  if (row === HEADER_ROWS) {
    focusTabAt(host, STRIP_WIDTH + 1, col)
  }
}

/** Map a sidebar screen row to a worktree, honoring the sidebar's scroll window
 *  so a click resolves to the same worktree the row renders. Returns true when a
 *  worktree row was hit (vs a header/spacer/gutter). */
function selectSidebarRow(
  host: ControllerHost,
  screenRow: number,
  switchToTerminal: boolean
): boolean {
  const lines = buildSidebarLines(host.snapshot(), host.resolveKind)
  const selectedLine = lines.findIndex(
    (line) => line.kind === 'row' && line.index === host.selectedIndex()
  )
  const start = windowStart(Math.max(0, selectedLine), lines.length, host.bodyHeight())
  const target = rowIndexAtScreenRow(lines, start + (screenRow - HEADER_ROWS))
  if (target === null) {
    return false
  }
  host.selectIndex(target)
  if (switchToTerminal) {
    host.setNarrowView('terminal')
  }
  return true
}

function focusTabAt(host: ControllerHost, originX: number, col: number): void {
  const specs = host.terminals().map((terminal) => ({
    handle: terminal.handle,
    label: truncateTabLabel(terminal.title)
  }))
  const handle = tabHandleAtColumn(tabRegions(specs, originX), col)
  if (handle) {
    host.setFocused(handle)
  }
}
