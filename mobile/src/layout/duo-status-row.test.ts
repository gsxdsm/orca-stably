import { describe, expect, it } from 'vitest'
import { spacing } from '../theme/mobile-theme'
import {
  DUO_RAIL_CONTROL_SIZE,
  DUO_STATUS_GLYPH_FROM_EDGE,
  DUO_STATUS_GLYPH_SIZE,
  duoImageCloseFrame,
  duoRailBackFrame,
  duoStatusRowCenter
} from './duo-status-row'
import { getSideRailStrip } from './side-rail-strip'

const INNER = {
  windowWidth: 951,
  windowHeight: 669,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
  occlusions: [{ x: 867, y: 0, width: 84, height: 124 }]
}
const COVER = {
  windowWidth: 466,
  windowHeight: 678,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
  occlusions: [
    { x: 399.67, y: 29.33, width: 37, height: 37 },
    { x: 382, y: 0, width: 84, height: 174 }
  ]
}
const ROW_CENTER = DUO_STATUS_GLYPH_FROM_EDGE + DUO_STATUS_GLYPH_SIZE / 2

describe('the Duo status row', () => {
  it('centers the inner column on the measured glyph, against the content edge', () => {
    const strip = getSideRailStrip(INNER)
    expect(strip).not.toBeNull()
    expect(duoStatusRowCenter({ ...INNER, strip: strip! })).toBe(ROW_CENTER)
    const frame = duoRailBackFrame({ ...INNER, strip: strip! })
    expect(frame).toEqual({
      top: ROW_CENTER - DUO_RAIL_CONTROL_SIZE / 2,
      left: INNER.windowWidth - 84 + spacing.sm,
      size: DUO_RAIL_CONTROL_SIZE
    })
    expect(frame.left).toBeLessThan(INNER.windowWidth - 84 + (84 - DUO_RAIL_CONTROL_SIZE) / 2)
  })

  it('uses the cover glyph itself, and the far edge when the column is turned', () => {
    const cover = getSideRailStrip(COVER)
    expect(duoStatusRowCenter({ ...COVER, strip: cover! })).toBe(29.33 + 37 / 2)
    const turned = {
      windowWidth: 951,
      windowHeight: 669,
      strip: getSideRailStrip({
        windowWidth: 951,
        windowHeight: 669,
        insets: { top: 0, right: 0, bottom: 34, left: 84 },
        occlusions: [{ x: 0, y: 545, width: 84, height: 124 }]
      })!
    }
    const frame = duoRailBackFrame({
      ...turned,
      occlusions: [{ x: 0, y: 545, width: 84, height: 124 }]
    })
    expect(frame.top).toBe(669 - ROW_CENTER - DUO_RAIL_CONTROL_SIZE / 2)
    expect(frame.left).toBe(84 - spacing.sm - DUO_RAIL_CONTROL_SIZE)
  })

  it('puts image close on that row and outside the column', () => {
    const rail = duoRailBackFrame({ ...INNER, strip: getSideRailStrip(INNER)! })
    const close = duoImageCloseFrame(INNER)
    expect(close.top).toBe(rail.top)
    expect(close.size).toBe(DUO_RAIL_CONTROL_SIZE)
    expect(close.left + (close.size ?? 0)).toBeLessThan(INNER.windowWidth - 84)

    const phone = duoImageCloseFrame({
      windowWidth: 390,
      windowHeight: 844,
      insets: { top: 12, right: 0, bottom: 21, left: 47 },
      occlusions: []
    })
    expect(phone).toEqual({ top: 12 + spacing.sm, left: 47 + spacing.lg, size: null })
  })
})
