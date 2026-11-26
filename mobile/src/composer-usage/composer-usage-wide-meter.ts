/** Free room under this keeps the compact meter: the folded Duo (~120pt) and phones have less. */
const WIDE_METER_MIN_ROOM = 160
const WIDE_METER_MIN_WIDTH = 140
const WIDE_METER_MAX_WIDTH = 360
/** Share of the free room the meter takes, so it grows with the composer without crowding it. */
const WIDE_METER_ROOM_SHARE = 0.75

/** The one-line meter's width in the composer row's free room; null keeps the compact meter. */
export function composerUsageWideMeterWidth(room: number | null): number | null {
  if (room === null || room < WIDE_METER_MIN_ROOM) {
    return null
  }
  const width = Math.max(WIDE_METER_MIN_WIDTH, Math.round(room * WIDE_METER_ROOM_SHARE))
  return Math.min(WIDE_METER_MAX_WIDTH, width, room)
}
