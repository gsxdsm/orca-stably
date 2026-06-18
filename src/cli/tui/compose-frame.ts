import { style } from './ansi-control'
import { fitCells } from './text-width'
import { headerRow, sidebarRows, statusRow, statusStripRows, tabStripRow } from './chrome-frame'
import { viewportRows } from './viewport-frame'
import { BACK_LABEL, STRIP_WIDTH } from './tui-layout'
import { overlayRows, type OverlayModel } from './overlay-frame'
import type { Platform } from './keybinding-map'
import type { StatusIndicatorKind } from './agent-state-indicator'
import type { TerminalAnsiFrame } from './terminal-ansi-source'
import type { WorktreeRow, WorktreeSnapshot } from './worktree-snapshot'
import type { NarrowView } from './tui-layout'

/** Everything the frame needs to draw one screen. The controller keeps the
 *  mutable state; this turns a snapshot of it into exact-width rows. */
export type FrameModel = {
  columns: number
  rows: number
  isNarrow: boolean
  narrowView: NarrowView
  snapshot: WorktreeSnapshot | null
  worktreeRows: readonly WorktreeRow[]
  selectedIndex: number
  selectedName: string
  sidebarWidth: number
  tabs: readonly { handle: string; title: string }[]
  /** All terminals grouped by worktree, for the nested sidebar tab lines. */
  terminalsByWorktree: ReadonlyMap<string, readonly { handle: string; title: string }[]>
  tabsExpanded: boolean
  focusedHandle: string | null
  /** True when keystrokes/scroll are captured by the terminal (input focus). */
  terminalFocused: boolean
  viewport: TerminalAnsiFrame
  /** Lines scrolled back from the live bottom of the focused terminal. */
  scrollOffset: number
  resolveKind: (row: WorktreeRow) => StatusIndicatorKind
  platform: Platform
  context: string
  disconnected: boolean
  error: string | null
  useColor: boolean
  overlay: OverlayModel
}

const BORDER = '│'

/** Compose the whole screen into `rows` full-width row strings (one per screen
 *  line), then stamp any active overlay over them. */
export function composeFrame(model: FrameModel): string[] {
  const bodyHeight = Math.max(1, model.rows - 2)
  const base =
    model.isNarrow && model.narrowView === 'terminal'
      ? narrowTerminalFrame(model, bodyHeight)
      : model.isNarrow
        ? narrowListFrame(model, bodyHeight)
        : wideFrame(model, bodyHeight)
  return overlayRows(base, model.overlay, model.columns, model.rows, model.useColor)
}

function headerLabel(model: FrameModel): string {
  const count = model.worktreeRows.length
  return ` orca tui · ${count} worktree${count === 1 ? '' : 's'}`
}

function sidebarTabsOptions(model: FrameModel): {
  terminalsByWorktree: ReadonlyMap<string, readonly { handle: string; title: string }[]>
  expanded: boolean
  focusedHandle: string | null
} {
  return {
    terminalsByWorktree: model.terminalsByWorktree,
    expanded: model.tabsExpanded,
    focusedHandle: model.focusedHandle
  }
}

function wideFrame(model: FrameModel, bodyHeight: number): string[] {
  const viewportWidth = Math.max(1, model.columns - model.sidebarWidth - 2)
  const left = sidebarRows(
    model.snapshot,
    model.selectedIndex,
    bodyHeight,
    model.sidebarWidth,
    model.resolveKind,
    model.useColor,
    sidebarTabsOptions(model)
  )
  const right = rightColumn(model, viewportWidth, bodyHeight)
  // A heavy cyan divider marks the right pane as input-focused; a dim thin one
  // means navigation has focus.
  const sep = model.terminalFocused
    ? `${style('┃', { fg: 'cyan', bold: true }, model.useColor)} `
    : `${style(BORDER, { dim: true }, model.useColor)} `
  const rows = [headerRow(headerLabel(model), model.columns, model.useColor)]
  for (let i = 0; i < bodyHeight; i += 1) {
    rows.push(`${left[i]}${sep}${right[i]}`)
  }
  rows.push(statusFooter(model))
  return rows
}

function narrowListFrame(model: FrameModel, bodyHeight: number): string[] {
  const body = sidebarRows(
    model.snapshot,
    model.selectedIndex,
    bodyHeight,
    model.columns,
    model.resolveKind,
    model.useColor,
    sidebarTabsOptions(model)
  )
  return [
    headerRow(headerLabel(model), model.columns, model.useColor),
    ...body,
    statusFooter(model)
  ]
}

function narrowTerminalFrame(model: FrameModel, bodyHeight: number): string[] {
  const viewportWidth = Math.max(1, model.columns - STRIP_WIDTH - 1)
  const strip = statusStripRows(
    model.worktreeRows,
    model.selectedIndex,
    bodyHeight,
    model.resolveKind,
    model.useColor
  )
  const right = rightColumn(model, viewportWidth, bodyHeight)
  const back = style(BACK_LABEL, { bg: 'cyan', fg: 'black', bold: true }, model.useColor)
  const title = style(
    fitCells(` ${model.selectedName}`, model.columns - BACK_LABEL.length),
    { bold: true },
    model.useColor
  )
  const rows = [back + title]
  for (let i = 0; i < bodyHeight; i += 1) {
    rows.push(`${strip[i]} ${right[i]}`)
  }
  rows.push(statusFooter(model))
  return rows
}

/** The right pane: tab strip on top, the focused terminal's verbatim output
 *  below — herdr-style tabs-over-terminal. */
function rightColumn(model: FrameModel, width: number, bodyHeight: number): string[] {
  const tab = tabStripRow(model.tabs, model.focusedHandle, width, model.useColor)
  const body = viewportRows(model.viewport, width, Math.max(0, bodyHeight - 1), model.scrollOffset)
  return [tab, ...body]
}

function statusFooter(model: FrameModel): string {
  return statusRow(
    model.columns,
    model.platform,
    model.context,
    model.disconnected,
    model.error,
    model.terminalFocused,
    model.useColor
  )
}
