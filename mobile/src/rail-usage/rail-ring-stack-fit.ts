/** How a column of usage rings fits a band of the rail. */
export type RailRingStackFit = {
  /** Clear space from a ring's percent label (or leading control) to the next ring's arc. */
  clearGap: number
  /** Layout gap between ring boxes: the label's overhang plus the clear gap below it. */
  gap: number
  /** Layout padding after the last ring box, its label's overhang included. */
  paddingBottom: number
  /** The scroller's height when it shows only some rings, its faded peek included; null fills the band. */
  height: number | null
  /** Distance between ring tops, for snapping a scroller that shows only some. */
  pitch: number
}

/**
 * A ring's full height runs to the bottom of the percent label under it, and every gap is measured
 * from there to the next ring's arc, so no label ever touches the next ring. Keeps the natural
 * spacing when every ring fits. Otherwise it tightens the gaps, then shows as many whole rings as
 * fit and cuts in the gap below the last one's label: only the next ring's top edge shows, under a fade.
 * When `leadingHeight` is set (a fixed control above the rings' scroller), its height and its clear gap
 * above the first ring share the same budget and spacing as the gaps between rings.
 */
export function railRingStackFit(args: {
  count: number
  /** The band's height; null before it is measured. */
  room: number | null
  ring: number
  /** How far a ring's percent label hangs below its box. */
  overhang: number
  /** Clear space from a label's bottom to the next ring's top. */
  gap: number
  minGap: number
  paddingTop: number
  /** Clear space below the last label. */
  paddingBottom: number
  /** A faded strip below the cut where the next ring's top edge shows there is more. */
  peek: number
  /** Height of a fixed control above the rings' scroller (0 overhang); 0 when absent. */
  leadingHeight?: number
}): RailRingStackFit {
  const {
    count,
    room,
    ring,
    overhang,
    gap,
    minGap,
    paddingTop,
    paddingBottom,
    peek,
    leadingHeight = 0
  } = args
  const item = ring + overhang
  const hasLeading = leadingHeight > 0
  const layout = (clear: number, endClear: number, height: number | null): RailRingStackFit => ({
    clearGap: clear,
    gap: clear + overhang,
    paddingBottom: endClear + overhang,
    height,
    pitch: item + clear
  })
  const gapCount = hasLeading ? count : count - 1
  if (room === null || count <= 0 || gapCount <= 0) {
    return layout(gap, paddingBottom, null)
  }
  const items = leadingHeight + count * item
  if (paddingTop + items + gapCount * gap + paddingBottom <= room) {
    return layout(gap, paddingBottom, null)
  }
  const tightBottom = Math.min(paddingBottom, 2)
  const tightGap = Math.floor((room - paddingTop - items - tightBottom) / gapCount)
  if (tightGap >= minGap) {
    return layout(Math.min(gap, tightGap), tightBottom, null)
  }
  const pitch = item + minGap
  // With a fixed leading control above the scroller, the scroller starts below it with paddingTop 0.
  const scrollPaddingTop = hasLeading ? 0 : paddingTop
  const scrollRoom = hasLeading ? room - (paddingTop + leadingHeight + minGap) : room
  const shown = Math.max(1, Math.floor((scrollRoom - peek - scrollPaddingTop - item) / pitch) + 1)
  return layout(minGap, tightBottom, scrollPaddingTop + (shown - 1) * pitch + item + 1 + peek)
}
