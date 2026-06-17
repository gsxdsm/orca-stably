/** Pure selection-index math for the herd list. Kept separate from the Ink app
 *  so navigation is unit-testable without rendering. */

/** Move the selection by `delta`, clamped to [0, total-1]. Returns 0 when the
 *  list is empty so the selection is always valid. */
export function moveSelection(index: number, delta: number, total: number): number {
  if (total <= 0) {
    return 0
  }
  const next = index + delta
  if (next < 0) {
    return 0
  }
  if (next > total - 1) {
    return total - 1
  }
  return next
}

/** Clamp an index into a (possibly shrunk) list so a selection survives herd
 *  refreshes that remove rows. */
export function clampSelection(index: number, total: number): number {
  if (total <= 0) {
    return 0
  }
  return Math.min(Math.max(index, 0), total - 1)
}
