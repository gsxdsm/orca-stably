import { buildSidebarLines, rowIndexAtScreenRow } from './sidebar-lines'
import { tabHandleAtColumn, tabRegions } from './pane-layout'
import { moveSelection, windowStart } from './navigation-state'
import { BACK_LABEL, HEADER_ROWS, STRIP_WIDTH, type NarrowView } from './tui-layout'
import { parseMouseEvents, type MouseEvent } from './mouse-input'
import type { WorktreeSnapshot } from './worktree-snapshot'

type Ref<T> = { current: T }

export type TuiMouseDeps = {
  snapshotRef: Ref<WorktreeSnapshot | null>
  rowCountRef: Ref<number>
  sidebarWidthRef: Ref<number>
  tabSpecsRef: Ref<{ handle: string; label: string }[]>
  selectedIndexRef: Ref<number>
  isNarrowRef: Ref<boolean>
  narrowViewRef: Ref<NarrowView>
  bodyRowsRef: Ref<number>
  setSelectedIndex: (updater: (index: number) => number) => void
  selectIndex: (index: number) => void
  setNarrowView: (view: NarrowView) => void
  setFocusedHandle: (handle: string) => void
}

/** Builds the stdin `data` handler that parses SGR mouse reports and routes
 *  clicks/scroll to selection, view switching, and tab focus. Kept out of the
 *  app component so the routing stays readable and the file stays small. */
export function createMouseDataHandler(deps: TuiMouseDeps): (chunk: Buffer | string) => void {
  const selectSidebarRow = (screenRow: number, switchToTerminal: boolean): void => {
    const target = rowIndexAtScreenRow(
      buildSidebarLines(deps.snapshotRef.current),
      screenRow - HEADER_ROWS
    )
    if (target !== null) {
      deps.selectIndex(target)
      if (switchToTerminal) {
        deps.setNarrowView('terminal')
      }
    }
  }
  const focusTabAt = (originX: number, col: number): void => {
    const handle = tabHandleAtColumn(tabRegions(deps.tabSpecsRef.current, originX), col)
    if (handle) {
      deps.setFocusedHandle(handle)
    }
  }
  const handleMouse = (event: MouseEvent): void => {
    if (event.type === 'scroll') {
      deps.setSelectedIndex((index) =>
        moveSelection(index, event.direction === 'down' ? 1 : -1, deps.rowCountRef.current)
      )
      return
    }
    if (event.type !== 'press' || event.button !== 'left') {
      return
    }
    if (deps.isNarrowRef.current) {
      if (deps.narrowViewRef.current === 'list') {
        selectSidebarRow(event.row, true)
        return
      }
      if (event.row === 0 && event.col < BACK_LABEL.length) {
        deps.setNarrowView('list')
        return
      }
      if (event.col < STRIP_WIDTH) {
        const start = windowStart(
          deps.selectedIndexRef.current,
          deps.rowCountRef.current,
          deps.bodyRowsRef.current
        )
        const index = start + (event.row - HEADER_ROWS)
        if (index >= 0 && index < deps.rowCountRef.current) {
          deps.selectIndex(index)
        }
        return
      }
      if (event.row === HEADER_ROWS) {
        focusTabAt(STRIP_WIDTH + 1, event.col)
      }
      return
    }
    // Wide: sidebar selects, the tab row focuses a terminal.
    if (event.col < deps.sidebarWidthRef.current) {
      selectSidebarRow(event.row, false)
      return
    }
    if (event.row === HEADER_ROWS) {
      focusTabAt(deps.sidebarWidthRef.current + 2, event.col)
    }
  }
  return (chunk: Buffer | string): void => {
    for (const event of parseMouseEvents(chunk.toString())) {
      handleMouse(event)
    }
  }
}
