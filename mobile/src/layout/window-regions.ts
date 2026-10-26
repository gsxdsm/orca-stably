/** A rect in window points. */
export type WindowRect = { x: number; y: number; width: number; height: number }

/**
 * Where the side rail can start: below every occluded rect that reaches the window's right edge
 * (the Duo's status column and Dynamic Island). Null when nothing there is occluded.
 */
export function sideRailTopFromOcclusions(
  occlusions: readonly WindowRect[],
  windowWidth: number
): number | null {
  let top: number | null = null
  for (const rect of occlusions) {
    if (rect.x + rect.width >= windowWidth - 1 && rect.x > windowWidth / 2) {
      top = Math.max(top ?? 0, rect.y + rect.height)
    }
  }
  return top
}
