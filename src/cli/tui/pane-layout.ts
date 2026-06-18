/** Geometry helpers for the main terminal panel (vertically split panes). Pure
 *  so the renderer and mouse hit-testing share one source of truth. */

/** Cap on simultaneously rendered panes; extra terminals are reachable by
 *  cycling focus but not all shown at once. */
export const MAX_PANES = 4

/** Distribute `available` body rows across `count` panes as evenly as possible,
 *  giving the remainder to the earliest panes. */
export function paneHeights(count: number, available: number): number[] {
  if (count <= 0 || available <= 0) {
    return []
  }
  const base = Math.floor(available / count)
  const remainder = available - base * count
  const heights: number[] = []
  for (let index = 0; index < count; index += 1) {
    heights.push(base + (index < remainder ? 1 : 0))
  }
  return heights
}

/** The window of tail lines to show for a pane of `height` rows, scrolled back
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

/** Map a row within the panes area (0 = first pane's title) to a pane index,
 *  mirroring the renderer's layout of one title row + a body per pane. */
export function paneIndexAtRow(count: number, available: number, relativeRow: number): number {
  if (count <= 0) {
    return 0
  }
  if (relativeRow < 0) {
    return 0
  }
  const bodyRows = Math.max(count, available - count)
  const heights = paneHeights(count, bodyRows)
  let y = 0
  for (let index = 0; index < count; index += 1) {
    const paneRows = 1 + (heights[index] ?? 0)
    if (relativeRow < y + paneRows) {
      return index
    }
    y += paneRows
  }
  return count - 1
}
