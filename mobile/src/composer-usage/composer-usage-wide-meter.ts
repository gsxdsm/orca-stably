/** Free room under this keeps the compact meter: a portrait phone or the folded Duo never has it. */
const WIDE_METER_MIN_ROOM = 220
const WIDE_METER_MIN_WIDTH = 160
const WIDE_METER_MAX_WIDTH = 360
/** Share of the free room the meter takes, so it grows with the composer without crowding it. */
const WIDE_METER_ROOM_SHARE = 0.6

/** The one-line meter's width in the composer row's free room; null keeps the compact meter. */
export function composerUsageWideMeterWidth(room: number | null): number | null {
  if (room === null || room < WIDE_METER_MIN_ROOM) {
    return null
  }
  return Math.min(
    WIDE_METER_MAX_WIDTH,
    Math.max(WIDE_METER_MIN_WIDTH, Math.round(room * WIDE_METER_ROOM_SHARE))
  )
}
