import { worktreeSelector } from './action-dispatch'
import {
  buildSidebarLines,
  rowIndexAtScreenRow,
  sidebarWindowStart,
  tabAtScreenRow,
  type SidebarLine
} from './sidebar-lines'
import { tabHandleAtColumn, tabRegions, truncateTabLabel } from './pane-layout'
import { windowStart } from './navigation-state'
import { tabGlyph, type SessionTab } from './session-tab'
import { BACK_LABEL, HEADER_ROWS, STRIP_WIDTH } from './tui-layout'
import type { ControllerHost } from './tui-input'
import type { MouseEvent } from './mouse-input'

/** Lines moved per scroll-wheel tick when scrolling the focused terminal. */
const SCROLL_LINES = 3

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
  if (event.type !== 'press' || (event.button !== 'left' && event.button !== 'right')) {
    return
  }
  const right = event.button === 'right'
  if (host.fileBrowserOpen()) {
    // Tapping the Files bar again closes it; clicking a row opens/expands it.
    if (event.row === 0) {
      host.toggleFiles()
    } else if (!right) {
      host.clickFile(event.row)
    }
    return
  }
  // The header's right segment is the Files button.
  if (event.row === 0) {
    if (!right && event.col >= host.sidebarWidth()) {
      host.toggleFiles()
    }
    return
  }
  if (host.isNarrow()) {
    routeNarrowMouse(host, event.col, event.row, right)
    return
  }
  routeWideMouse(host, event.col, event.row, right)
}

/** Wide layout: nested tab line jumps to that tab (right-click or re-clicking the
 *  focused tab asks to close it); a *different* workspace switches+focuses it
 *  (right-click asks to close it); the selected workspace (or empty space)
 *  focuses the workspace area; the tab strip / viewport focus the terminal. */
function routeWideMouse(host: ControllerHost, col: number, row: number, right: boolean): void {
  if (col < host.sidebarWidth()) {
    const { lines, lineIndex } = sidebarHit(host, row)
    const tab = tabAtScreenRow(lines, lineIndex)
    if (tab) {
      tabClick(host, tab.index, tab.id, right)
      return
    }
    const target = rowIndexAtScreenRow(lines, lineIndex)
    if (right) {
      if (target !== null) {
        requestCloseWorktree(host, target)
      }
    } else if (target === null || target === host.selectedIndex()) {
      host.exitTerminalFocus()
    } else {
      host.selectIndex(target)
      host.focusTerminal()
    }
  } else if (row === HEADER_ROWS) {
    focusTabAt(host, host.sidebarWidth() + 2, col, right)
  } else if (!right) {
    host.focusTerminal()
  }
}

function routeNarrowMouse(host: ControllerHost, col: number, row: number, right: boolean): void {
  if (host.narrowView() === 'list') {
    const { lines, lineIndex } = sidebarHit(host, row)
    const tab = tabAtScreenRow(lines, lineIndex)
    if (tab) {
      if (right || tab.id === host.focusedTabId()) {
        requestCloseTab(host, tab.index, tab.id)
      } else {
        host.jumpToTab(tab.index, tab.id)
        host.setNarrowView('terminal')
      }
      return
    }
    const target = rowIndexAtScreenRow(lines, lineIndex)
    if (target === null) {
      return
    }
    if (right) {
      requestCloseWorktree(host, target)
    } else {
      host.selectIndex(target)
      host.setNarrowView('terminal')
    }
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
    focusTabAt(host, STRIP_WIDTH + 1, col, right)
  }
}

/** Build the sidebar lines (with nested tabs) the same way the renderer does,
 *  and resolve which line a screen row hit — honoring the scroll window so the
 *  hit-test never drifts from what's drawn. */
function sidebarHit(
  host: ControllerHost,
  screenRow: number
): { lines: readonly SidebarLine[]; lineIndex: number } {
  const lines = buildSidebarLines(host.snapshot(), host.resolveKind, {
    tabsByWorktree: host.tabsByWorktree(),
    expanded: host.tabsExpanded(),
    focusedTabId: host.focusedTabId()
  })
  const start = sidebarWindowStart(lines, host.selectedIndex(), host.bodyHeight())
  return { lines, lineIndex: start + (screenRow - HEADER_ROWS) }
}

/** Resolve a click on the right-pane tab strip to a tab. The spec label includes
 *  the kind glyph so the click regions match the rendered tabs. */
function focusTabAt(host: ControllerHost, originX: number, col: number, right: boolean): void {
  const specs = host.terminals().map((tab) => ({
    handle: tab.id,
    label: `${tabGlyph(tab.kind)} ${truncateTabLabel(tab.title)}`
  }))
  const id = tabHandleAtColumn(tabRegions(specs, originX), col)
  if (id) {
    tabClick(host, host.selectedIndex(), id, right)
  }
}

/** Right-click or re-clicking the focused tab asks to close it; otherwise jump. */
function tabClick(host: ControllerHost, index: number, tabId: string, right: boolean): void {
  if (right || tabId === host.focusedTabId()) {
    requestCloseTab(host, index, tabId)
  } else {
    host.jumpToTab(index, tabId)
    host.focusTerminal()
  }
}

/** Select the tab's worktree and ask to close the tab (session.tabs.close). */
function requestCloseTab(host: ControllerHost, index: number, tabId: string): void {
  host.selectIndex(index)
  let tab: SessionTab | undefined
  for (const tabs of host.tabsByWorktree().values()) {
    tab = tabs.find((candidate) => candidate.id === tabId)
    if (tab) {
      break
    }
  }
  if (!tab) {
    return
  }
  host.setOverlay({
    kind: 'confirm',
    message: `Close "${tab.title}"?`,
    command: { kind: 'session.tabs.close', worktree: worktreeSelector(tab.worktreeId), tabId }
  })
}

/** Select the worktree and ask to remove it (worktree.rm). */
function requestCloseWorktree(host: ControllerHost, index: number): void {
  const row = host.worktreeRows()[index]
  if (!row) {
    return
  }
  host.selectIndex(index)
  host.setOverlay({
    kind: 'confirm',
    message: `Remove worktree "${row.displayName}"?`,
    command: { kind: 'worktree.rm', worktree: worktreeSelector(row.worktreeId), force: true }
  })
}
