import { describe, expect, it } from 'vitest'
import {
  DUO_RAIL_CONTROL_SIZE,
  duoRailBackFrame,
  duoRailJumpFrames
} from '../layout/duo-status-row'
import { getSideRailStrip } from '../layout/side-rail-strip'
import { spacing } from '../theme/mobile-theme'
import { duoRailJumpPlacement } from './duo-rail-jump'

const COVER = {
  windowWidth: 466,
  windowHeight: 678,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
  occlusions: [
    { x: 399.67, y: 29.33, width: 37, height: 37 },
    { x: 382, y: 0, width: 84, height: 174 }
  ]
}

const INNER = {
  windowWidth: 951,
  windowHeight: 669,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
  occlusions: [{ x: 867, y: 0, width: 84, height: 124 }]
}

function columnOf(scene: typeof COVER) {
  return scene.occlusions.find((region) => region.width >= 80)!
}

describe('Duo rail jump placement', () => {
  it('stacks the arrows in the cover column, below the back button and above the home indicator', () => {
    const strip = getSideRailStrip(COVER)
    const column = columnOf(COVER)
    const back = duoRailBackFrame({ ...COVER, strip: strip! })
    const frames = duoRailJumpPlacement({
      chatVisible: true,
      expanded: false,
      strip,
      keyboardInset: 0,
      windowWidth: COVER.windowWidth,
      windowHeight: COVER.windowHeight,
      occlusions: COVER.occlusions
    })
    expect(strip).not.toBeNull()
    expect(frames).toEqual({
      previous: {
        top:
          COVER.windowHeight -
          strip!.bottom -
          spacing.md -
          DUO_RAIL_CONTROL_SIZE -
          spacing.sm -
          DUO_RAIL_CONTROL_SIZE,
        left: back.left,
        size: DUO_RAIL_CONTROL_SIZE
      },
      latest: {
        top: COVER.windowHeight - strip!.bottom - spacing.md - DUO_RAIL_CONTROL_SIZE,
        left: back.left,
        size: DUO_RAIL_CONTROL_SIZE
      }
    })
    expect(frames!.previous.top).toBeGreaterThanOrEqual(back.top + back.size + spacing.sm)
    expect(frames!.latest.top + frames!.latest.size).toBeLessThanOrEqual(
      COVER.windowHeight - COVER.insets.bottom
    )
    expect(frames!.latest.left).toBeGreaterThanOrEqual(column.x)
    expect(frames!.latest.left + frames!.latest.size).toBeLessThanOrEqual(column.x + column.width)
    expect(frames!.previous.left + frames!.previous.size / 2).toBe(back.left + back.size / 2)
  })

  it('uses the same column midX on the inner display', () => {
    const strip = getSideRailStrip(INNER)
    const column = columnOf(INNER)
    const back = duoRailBackFrame({ ...INNER, strip: strip! })
    const frames = duoRailJumpFrames({ ...INNER, strip: strip! })
    expect(frames).not.toBeNull()
    expect(frames!.latest.left).toBe(back.left)
    expect(frames!.previous.left).toBe(back.left)
    expect(frames!.latest.size).toBe(DUO_RAIL_CONTROL_SIZE)
    expect(frames!.previous.top).toBeGreaterThanOrEqual(back.top + back.size + spacing.sm)
    expect(frames!.latest.left).toBeGreaterThanOrEqual(column.x)
    expect(frames!.latest.left + frames!.latest.size).toBeLessThanOrEqual(column.x + column.width)
    expect(frames!.latest.top + frames!.latest.size).toBeLessThanOrEqual(
      INNER.windowHeight - INNER.insets.bottom
    )
  })

  it('keeps in-transcript placement when chat is expanded, the keyboard is up, or there is no rail', () => {
    const strip = getSideRailStrip(COVER)
    const placed = {
      chatVisible: true,
      expanded: false,
      strip,
      keyboardInset: 0,
      windowWidth: COVER.windowWidth,
      windowHeight: COVER.windowHeight,
      occlusions: COVER.occlusions
    }
    expect(duoRailJumpPlacement(placed)).not.toBeNull()
    expect(duoRailJumpPlacement({ ...placed, expanded: true })).toBeNull()
    expect(duoRailJumpPlacement({ ...placed, keyboardInset: 312 })).toBeNull()
    expect(duoRailJumpPlacement({ ...placed, strip: null })).toBeNull()
    expect(duoRailJumpPlacement({ ...placed, chatVisible: false })).toBeNull()
  })

  it('keeps in-transcript placement when the turned column leaves no room below the back button', () => {
    const occlusion = { x: 0, y: 545, width: 84, height: 124 }
    const turned = {
      windowWidth: 951,
      windowHeight: 669,
      insets: { top: 0, right: 0, bottom: 34, left: 84 },
      occlusions: [occlusion]
    }
    const strip = getSideRailStrip(turned)
    const back = duoRailBackFrame({ ...turned, strip: strip! })
    expect(back.top + back.size).toBeGreaterThan(occlusion.y - spacing.sm - DUO_RAIL_CONTROL_SIZE)
    expect(
      duoRailJumpPlacement({
        chatVisible: true,
        expanded: false,
        strip,
        keyboardInset: 0,
        windowWidth: turned.windowWidth,
        windowHeight: turned.windowHeight,
        occlusions: turned.occlusions
      })
    ).toBeNull()
    expect(duoRailJumpFrames({ ...turned, strip: strip! })).toBeNull()
  })
})
