/** Geometry helpers for the main terminal panel (tabs on top + the focused
 *  terminal's output below). Pure so the renderer and mouse hit-testing share
 *  one source of truth. */

/** Cap on terminals listed as tabs for one worktree. */
export const MAX_PANES = 6

export type TabSpec = { handle: string; label: string }
export type TabRegion = { handle: string; x: number; width: number }

const TAB_MAX_LABEL = 18

/** Truncate a terminal title to a tab-friendly width. */
export function truncateTabLabel(title: string, max: number = TAB_MAX_LABEL): string {
  const clean = title.trim().length > 0 ? title.trim() : 'shell'
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** Each tab renders as ` label ` (one space of padding each side) starting at
 *  `originX`; returns the clickable x-range per tab so a press resolves to a
 *  handle. Labels must already be truncated via {@link truncateTabLabel}. */
export function tabRegions(tabs: readonly TabSpec[], originX: number): TabRegion[] {
  const regions: TabRegion[] = []
  let x = originX
  for (const tab of tabs) {
    const width = tab.label.length + 2
    regions.push({ handle: tab.handle, x, width })
    x += width
  }
  return regions
}

/** Resolve a click column on the tab row to a tab handle, or null. */
export function tabHandleAtColumn(regions: readonly TabRegion[], col: number): string | null {
  for (const region of regions) {
    if (col >= region.x && col < region.x + region.width) {
      return region.handle
    }
  }
  return null
}

/** The window of tail lines to show in a body of `height` rows, scrolled back
 *  by `scrollOffset` lines (0 = latest at the bottom). */
export function visibleTailLines(
  lines: readonly string[],
  height: number,
  scrollOffset: number
): string[] {
  if (height <= 0) {
    return []
  }
  const end = Math.max(0, lines.length - Math.max(0, scrollOffset))
  const start = Math.max(0, end - height)
  return lines.slice(start, end)
}
