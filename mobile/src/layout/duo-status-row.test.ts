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

function overlaps(
  frame: { top: number; left: number; size: number | null },
  region: { x: number; y: number; width: number; height: number }
): boolean {
  const size = frame.size ?? 0
  return (
    frame.left < region.x + region.width &&
    frame.left + size > region.x &&
    frame.top < region.y + region.height &&
    frame.top + size > region.y
  )
}

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

  it('steps the cover control below the camera and keeps the turned column on its row', () => {
    const cover = getSideRailStrip(COVER)
    const glyph = COVER.occlusions[0]!
    expect(duoStatusRowCenter({ ...COVER, strip: cover! })).toBe(glyph.y + glyph.height / 2)
    const frame = duoRailBackFrame({ ...COVER, strip: cover! })
    expect(frame).toEqual({
      top: glyph.y + glyph.height + spacing.sm,
      left: COVER.windowWidth - 84 + spacing.sm,
      size: DUO_RAIL_CONTROL_SIZE
    })
    expect(frame.left + frame.size).toBeLessThanOrEqual(COVER.windowWidth - spacing.sm)
    expect(frame.top).toBeGreaterThanOrEqual(glyph.y + glyph.height)
    expect(overlaps(frame, glyph)).toBe(false)

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
    const turnedFrame = duoRailBackFrame({
      ...turned,
      occlusions: [{ x: 0, y: 545, width: 84, height: 124 }]
    })
    expect(turnedFrame.top).toBe(669 - ROW_CENTER - DUO_RAIL_CONTROL_SIZE / 2)
    expect(turnedFrame.left).toBe(84 - spacing.sm - DUO_RAIL_CONTROL_SIZE)
  })

  it('steps above the glyph when that column touches the bottom edge', () => {
    const glyph = { x: 29.33, y: 678 - 29.33 - 37, width: 37, height: 37 }
    const scene = {
      windowWidth: 466,
      windowHeight: 678,
      insets: { top: 0, right: 0, bottom: 34, left: 84 },
      occlusions: [glyph, { x: 0, y: 678 - 174, width: 84, height: 174 }]
    }
    const frame = duoRailBackFrame({ ...scene, strip: getSideRailStrip(scene)! })
    expect(frame.top).toBe(glyph.y - spacing.sm - DUO_RAIL_CONTROL_SIZE)
    expect(frame.left).toBe(84 - spacing.sm - DUO_RAIL_CONTROL_SIZE)
    expect(overlaps(frame, glyph)).toBe(false)
  })

  it('puts image close a step off the status-row corner and outside the column', () => {
    const rail = duoRailBackFrame({ ...INNER, strip: getSideRailStrip(INNER)! })
    const close = duoImageCloseFrame(INNER)
    expect(close.top).toBe(rail.top + spacing.sm)
    expect(close.left).toBe(spacing.lg + spacing.sm)
    expect(close.size).toBe(DUO_RAIL_CONTROL_SIZE)
    expect(close.left + (close.size ?? 0)).toBeLessThan(INNER.windowWidth - 84)

    const coverClose = duoImageCloseFrame(COVER)
    const glyph = COVER.occlusions[0]!
    const column = COVER.occlusions[1]!
    expect(coverClose.top).toBe(glyph.y + glyph.height / 2 - DUO_RAIL_CONTROL_SIZE / 2 + spacing.sm)
    expect(coverClose.left).toBe(spacing.lg + spacing.sm)
    expect(overlaps(coverClose, glyph)).toBe(false)
    expect(overlaps(coverClose, column)).toBe(false)

    const turnedClose = duoImageCloseFrame({
      windowWidth: 951,
      windowHeight: 669,
      insets: { top: 0, right: 0, bottom: 34, left: 84 },
      occlusions: [{ x: 0, y: 545, width: 84, height: 124 }]
    })
    expect(turnedClose.top).toBe(669 - ROW_CENTER - DUO_RAIL_CONTROL_SIZE / 2 - spacing.sm)
    expect(turnedClose.left).toBe(84 + spacing.lg + spacing.sm)

    const phone = duoImageCloseFrame({
      windowWidth: 390,
      windowHeight: 844,
      insets: { top: 12, right: 0, bottom: 21, left: 47 },
      occlusions: []
    })
    expect(phone).toEqual({ top: 12 + spacing.sm, left: 47 + spacing.lg, size: null })
  })
})
