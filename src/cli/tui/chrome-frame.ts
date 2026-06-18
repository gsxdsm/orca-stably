import { style, type TextStyle } from './ansi-control'
import { cellWidth, fitCells } from './text-width'
import { indicatorFor } from './agent-state-indicator'
import { buildSidebarLines, type SidebarLine, type SidebarTabsOptions } from './sidebar-lines'
import { windowStart } from './navigation-state'
import { truncateTabLabel } from './pane-layout'
import { statusBarHelp, type Platform } from './keybinding-map'
import type { StatusIndicatorKind } from './agent-state-indicator'
import type { WorktreeRow, WorktreeSnapshot } from './worktree-snapshot'

/** Renders the dashboard chrome (header, sidebar, tab strip, status bar) as
 *  exact-width styled strings the compositor lays into fixed rectangles. Pure so
 *  the layout matches the mouse hit-testing geometry exactly. */

export function headerRow(label: string, width: number, useColor: boolean): string {
  return style(fitCells(label, width), { bg: 'cyan', fg: 'black', bold: true }, useColor)
}

/** The vertical column of worktree status glyphs for the narrow terminal view. */
export function statusStripRows(
  rows: readonly WorktreeRow[],
  selectedIndex: number,
  height: number,
  resolveKind: (row: WorktreeRow) => StatusIndicatorKind,
  useColor: boolean
): string[] {
  const start = windowStart(selectedIndex, rows.length, height)
  const out: string[] = []
  for (let i = 0; i < height; i += 1) {
    const row = rows[start + i]
    if (!row) {
      out.push('  ')
      continue
    }
    const indicator = indicatorFor(resolveKind(row))
    const selected = start + i === selectedIndex
    out.push(
      style(
        `${indicator.glyph} `,
        selected ? { inverse: true, bold: true } : { fg: indicator.color },
        useColor
      )
    )
  }
  return out
}

export function tabStripRow(
  tabs: readonly { handle: string; title: string }[],
  focusedHandle: string | null,
  width: number,
  useColor: boolean
): string {
  if (tabs.length === 0) {
    return style(fitCells(' no terminals — press c to start one', width), { dim: true }, useColor)
  }
  const focused = focusedHandle ?? tabs[0].handle
  let out = ''
  let used = 0
  for (const tab of tabs) {
    const label = ` ${truncateTabLabel(tab.title)} `
    if (used + cellWidth(label) > width) {
      break
    }
    const isFocused = tab.handle === focused
    const spec: TextStyle = isFocused ? { bg: 'cyan', fg: 'black', bold: true } : { dim: true }
    out += style(label, spec, useColor)
    used += cellWidth(label)
  }
  return out + ' '.repeat(Math.max(0, width - used))
}

export function statusRow(
  width: number,
  platform: Platform,
  context: string,
  disconnected: boolean,
  error: string | null,
  terminalFocused: boolean,
  useColor: boolean
): string {
  if (error) {
    return style(fitCells(` ${error}`, width), { fg: 'red', bold: true }, useColor)
  }
  if (disconnected) {
    return style(
      fitCells(' runtime disconnected — reconnecting…', width),
      { fg: 'yellow' },
      useColor
    )
  }
  // In terminal focus, keystrokes go to the PTY — show how to get back and scroll
  // rather than the navigation keymap (which is inactive).
  if (terminalFocused) {
    const left = style(' ● terminal ', { bg: 'cyan', fg: 'black', bold: true }, useColor)
    const rest = style(
      fitCells(' Ctrl-] navigate · wheel scrolls history · keys → terminal', width - 12),
      { dim: true },
      useColor
    )
    return left + rest
  }
  const hints = statusBarHelp(platform)
    .map((hint) => `${hint.keys} ${hint.hint}`)
    .join('  ')
  const left = context ? `${context}  ` : ''
  const ctx = style(left, { fg: 'cyan' }, useColor)
  const rest = style(fitCells(hints, Math.max(0, width - cellWidth(left))), { dim: true }, useColor)
  return ctx + rest
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function sidebarRows(
  snapshot: WorktreeSnapshot | null,
  selectedIndex: number,
  height: number,
  width: number,
  resolveKind: (row: WorktreeRow) => StatusIndicatorKind,
  useColor: boolean,
  tabs: SidebarTabsOptions = {}
): string[] {
  const lines = buildSidebarLines(snapshot, resolveKind, tabs)
  if (!lines.some((line) => line.kind === 'row')) {
    return emptySidebar(height, width, useColor)
  }
  const selectedLine = lines.findIndex(
    (line) => line.kind === 'row' && line.index === selectedIndex
  )
  const start = windowStart(Math.max(0, selectedLine), lines.length, height)
  const out: string[] = []
  for (let i = 0; i < height; i += 1) {
    const line = lines[start + i]
    out.push(line ? renderSidebarLine(line, selectedIndex, width, useColor) : ' '.repeat(width))
  }
  return out
}

function emptySidebar(height: number, width: number, useColor: boolean): string[] {
  const out: string[] = []
  for (let i = 0; i < height; i += 1) {
    if (i === 0) {
      out.push(style(fitCells('WORKTREES', width), { bold: true }, useColor))
    } else if (i === 2) {
      out.push(style(fitCells('No worktrees yet.', width), { dim: true }, useColor))
    } else {
      out.push(' '.repeat(width))
    }
  }
  return out
}

function renderSidebarLine(
  line: SidebarLine,
  selectedIndex: number,
  width: number,
  useColor: boolean
): string {
  if (line.kind === 'header') {
    return style(fitCells('WORKTREES', width), { bold: true }, useColor)
  }
  if (line.kind === 'spacer') {
    return ' '.repeat(width)
  }
  if (line.kind === 'group') {
    return style(fitCells(line.repo, width), { dim: true }, useColor)
  }
  if (line.kind === 'tab') {
    return renderTabLine(line, width, useColor)
  }
  return renderWorktreeRow(line, line.index === selectedIndex, width, useColor)
}

/** A nested terminal tab under its worktree: indented, focused tab highlighted. */
function renderTabLine(
  line: Extract<SidebarLine, { kind: 'tab' }>,
  width: number,
  useColor: boolean
): string {
  const label = `   ${line.focused ? '▸' : '·'} ${truncateTabLabel(line.title)}`
  return style(
    fitCells(label, width),
    line.focused ? { fg: 'cyan', bold: true } : { dim: true },
    useColor
  )
}

function renderWorktreeRow(
  line: Extract<SidebarLine, { kind: 'row' }>,
  selected: boolean,
  width: number,
  useColor: boolean
): string {
  const indicator = indicatorFor(line.indicator)
  if (selected) {
    const text = `${indicator.glyph} ${line.displayName}${line.badges ? `  ${line.badges}` : ''}`
    return style(fitCells(text, width), { inverse: true, bold: true }, useColor)
  }
  const glyph = style(`${indicator.glyph} `, { fg: indicator.color }, useColor)
  const badgeWidth = line.badges ? cellWidth(line.badges) + 1 : 0
  const nameWidth = Math.max(0, width - 2 - badgeWidth)
  const name = fitCells(line.displayName, nameWidth)
  const badges = line.badges ? ` ${style(line.badges, { dim: true }, useColor)}` : ''
  return `${glyph}${name}${badges}`
}
