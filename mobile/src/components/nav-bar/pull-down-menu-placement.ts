export const PULL_DOWN_MENU_WIDTH = 252
const ANCHOR_GAP = 6
const EDGE_INSET = 8

type Box = { x: number; y: number; width: number; height: number }
type SideInsets = { top: number; right: number; bottom: number; left: number }

export type PullDownMenuPlacement = {
  left: number
  width: number
  maxHeight: number
  /** Which corner it grows from: under the button, or above it when the button sits low. */
  origin: 'top' | 'bottom'
} & ({ top: number } | { bottom: number })

/**
 * Where the menu sits inside the layer it is drawn in. `anchor` is relative to that layer, so a
 * stale window size or an offset layer cannot push it off-screen; it stays inside the safe area.
 */
export function placePullDownMenu(args: {
  anchor: Box
  layer: { width: number; height: number }
  insets: SideInsets
}): PullDownMenuPlacement {
  const { anchor, layer, insets } = args
  const minLeft = insets.left + EDGE_INSET
  const maxRight = layer.width - insets.right - EDGE_INSET
  const width = Math.max(0, Math.min(PULL_DOWN_MENU_WIDTH, maxRight - minLeft))
  // Right-aligned to the button, then pulled back inside the safe area.
  const left = Math.max(minLeft, Math.min(anchor.x + anchor.width - width, maxRight - width))
  if (anchor.y + anchor.height / 2 > layer.height / 2) {
    const bottom = layer.height - anchor.y + ANCHOR_GAP
    return {
      left,
      width,
      bottom,
      maxHeight: Math.max(0, layer.height - bottom - insets.top - EDGE_INSET),
      origin: 'bottom'
    }
  }
  const top = anchor.y + anchor.height + ANCHOR_GAP
  return {
    left,
    width,
    top,
    maxHeight: Math.max(0, layer.height - top - insets.bottom - EDGE_INSET),
    origin: 'top'
  }
}
