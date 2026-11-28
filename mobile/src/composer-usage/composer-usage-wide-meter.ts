/**
 * Chat pane width below this always keeps the compact meter: phones, folded Duo (~466pt),
 * unfolded Duo Split View (~455–611pt), and narrow iPad Split View / Slide Over (~375–605pt) stay
 * compact so the model name keeps room, while full-screen unfolded Duo (~867–951pt) and full-screen
 * iPad (~684–1296pt) use the wide one-line meter.
 */
export const WIDE_PANE_MIN_WIDTH = 650

/** Free room inside the slot under this keeps the compact meter even on a wide pane. */
export const WIDE_METER_MIN_ROOM = 160
const WIDE_METER_MIN_WIDTH = 140
const WIDE_METER_MAX_WIDTH = 360
/** Share of the free room the meter takes, so it grows with the composer without crowding it. */
const WIDE_METER_ROOM_SHARE = 0.75

/** Whether the chat pane is wide enough to offer the one-line wide meter instead of the compact bar. */
export function composerUsagePaneAllowsWideMeter(paneWidth: number | null): boolean {
  return paneWidth !== null && paneWidth >= WIDE_PANE_MIN_WIDTH
}

/** The one-line meter's width in the composer row's free room; null keeps the compact meter. */
export function composerUsageWideMeterWidth(
  room: number | null,
  paneWidth?: number | null
): number | null {
  if (paneWidth !== undefined && !composerUsagePaneAllowsWideMeter(paneWidth)) {
    return null
  }
  if (room === null || room < WIDE_METER_MIN_ROOM) {
    return null
  }
  const width = Math.max(WIDE_METER_MIN_WIDTH, Math.round(room * WIDE_METER_ROOM_SHARE))
  return Math.min(WIDE_METER_MAX_WIDTH, width, room)
}

/** The bar keeps at least this much when the full reset label takes the rest. */
const WIDE_METER_MIN_BAR = 60

/**
 * The one-line meter's width and reset label: the full label ("6d 16h") whenever it and the
 * percent fit beside the minimum bar, widening the meter up to the room for it; the largest unit
 * alone ("6d") only when even that doesn't fit. Unmeasured labels count as fitting.
 */
export function composerUsageWideMeterLayout(args: {
  room: number | null
  /** Live chat pane width; narrow panes (folded Duo, Split View) stay on the compact meter. */
  paneWidth?: number | null
  /** The full reset label's and the percent's widths at the wide meter's size. */
  fullLabelWidth: number | null
  percentWidth: number | null
  /** The space between label, bar and percent. */
  gap: number
}): { width: number; label: 'full' | 'compact' } | null {
  const { room, paneWidth, fullLabelWidth, percentWidth, gap } = args
  const width = composerUsageWideMeterWidth(room, paneWidth)
  if (width === null || room === null) {
    return null
  }
  if (fullLabelWidth === null || percentWidth === null) {
    return { width, label: 'full' }
  }
  const need = Math.ceil(fullLabelWidth + percentWidth + 2 * gap + WIDE_METER_MIN_BAR)
  return need <= room
    ? { width: Math.max(width, need), label: 'full' }
    : { width, label: 'compact' }
}
