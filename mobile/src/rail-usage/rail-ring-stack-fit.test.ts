import { describe, expect, it } from 'vitest'
import { duoRailFreeBand } from '../layout/duo-status-row'
import { getSideRailStrip } from '../layout/side-rail-strip'
import { railRingStackFit, type RailRingStackFit } from './rail-ring-stack-fit'

const base = {
  ring: 41,
  overhang: 5,
  gap: 12,
  minGap: 8,
  paddingTop: 12,
  paddingBottom: 16,
  peek: 12
}

/** Each ring's arc top and label bottom, as the column lays them out. */
function rings(fit: RailRingStackFit, count: number): { top: number; labelBottom: number }[] {
  return Array.from({ length: count }, (_, index) => {
    const top = base.paddingTop + index * (base.ring + fit.gap)
    return { top, labelBottom: top + base.ring + base.overhang }
  })
}

describe('railRingStackFit', () => {
  it('leaves a full gap between each percent label and the next ring', () => {
    const fit = railRingStackFit({ ...base, count: 5, room: 400 })
    expect(fit).toEqual({ clearGap: 12, gap: 17, paddingBottom: 21, height: null, pitch: 58 })
    const laid = rings(fit, 5)
    for (let index = 1; index < laid.length; index++) {
      expect(laid[index].top - laid[index - 1].labelBottom).toBe(12)
      expect(laid[index].top - laid[index - 1].top).toBe(fit.pitch)
    }
    // 12 + 5*46 + 4*12 + 16 = 306
    expect(laid[4].labelBottom + fit.paddingBottom - base.overhang).toBe(306)
  })

  it('tightens the gaps before cutting any ring, and never below the minimum', () => {
    // 12 + 5*46 + 4*9 + 2 = 280
    const fit = railRingStackFit({ ...base, count: 5, room: 280 })
    expect(fit).toEqual({ clearGap: 9, gap: 14, paddingBottom: 7, height: null, pitch: 55 })
    const laid = rings(fit, 5)
    expect(laid[1].top - laid[0].labelBottom).toBe(9)
    expect(laid[4].labelBottom + fit.paddingBottom - base.overhang).toBeLessThanOrEqual(280)
  })

  it('shows only whole rings, labels included, cut in the gap after the last one', () => {
    const fit = railRingStackFit({ ...base, count: 5, room: 200 })
    // Three rings at pitch 54 end their labels at 12 + 2*54 + 46 = 166; a fourth would need 220 + peek.
    expect(fit).toEqual({ clearGap: 8, gap: 13, paddingBottom: 7, height: 179, pitch: 54 })
    const laid = rings(fit, 5)
    expect(laid[1].top - laid[0].labelBottom).toBe(8)
    expect(fit.height!).toBeLessThanOrEqual(200)
    // The fade starts below the third label and above the fourth ring's top.
    expect(fit.height! - base.peek).toBeGreaterThanOrEqual(laid[2].labelBottom)
    expect(fit.height! - base.peek).toBeLessThanOrEqual(laid[3].top)
  })

  it('keeps even clear gaps with a leading Items button and tightens before scrolling', () => {
    // Natural fit: 12 + 41 + 5*46 + 5*12 + 16 = 359
    const natural = railRingStackFit({ ...base, count: 5, room: 400, leadingHeight: 41 })
    expect(natural).toEqual({ clearGap: 12, gap: 17, paddingBottom: 21, height: null, pitch: 58 })

    // Tightened fit on folded-split Duo: 12 + 41 + 5*46 + 5*9 + 2 = 330
    const tight = railRingStackFit({ ...base, count: 5, room: 330, leadingHeight: 41 })
    expect(tight).toEqual({ clearGap: 9, gap: 14, paddingBottom: 7, height: null, pitch: 55 })

    // Cut/scroll: fixed header takes 12 + 41 + 8 = 61; remaining 200 - 61 = 139 fits 2 whole rings + peek.
    const cut = railRingStackFit({ ...base, count: 5, room: 200, leadingHeight: 41 })
    expect(cut).toEqual({ clearGap: 8, gap: 13, paddingBottom: 7, height: 113, pitch: 54 })
    expect(12 + 41 + cut.clearGap + cut.height!).toBeLessThanOrEqual(200)
  })

  it('fits all 5 rings with Back and Items on folded and unfolded Duo when jump buttons are hidden', () => {
    const cover = {
      windowWidth: 466,
      windowHeight: 678,
      insets: { top: 0, right: 84, bottom: 34, left: 0 },
      occlusions: [
        { x: 399.67, y: 29.33, width: 37, height: 37 },
        { x: 382, y: 0, width: 84, height: 174 }
      ]
    }
    const coverStrip = getSideRailStrip(cover)!
    const coverBand = duoRailFreeBand({
      ...cover,
      strip: coverStrip,
      composerTop: 600,
      backShown: true,
      visibleJumpButtons: 0
    })!
    const coverRoom =
      Math.min(coverBand.bottom, cover.windowHeight - coverStrip.bottom) -
      Math.max(coverBand.top, coverStrip.top)
    // 5 rings + Items button (41 + 3 visual slack) fit without clipping or fading.
    const coverFit = railRingStackFit({ ...base, count: 5, room: coverRoom, leadingHeight: 44 })
    expect(coverFit.height).toBeNull()
    expect(coverFit.clearGap).toBe(12)

    const inner = {
      windowWidth: 951,
      windowHeight: 669,
      insets: { top: 0, right: 84, bottom: 34, left: 0 },
      occlusions: [{ x: 867, y: 0, width: 84, height: 124 }]
    }
    const innerStrip = getSideRailStrip(inner)!
    const innerBand = duoRailFreeBand({
      ...inner,
      strip: innerStrip,
      composerTop: 585,
      backShown: false,
      visibleJumpButtons: 0
    })!
    const innerRoom =
      Math.min(innerBand.bottom, inner.windowHeight - innerStrip.bottom) -
      Math.max(innerBand.top, innerStrip.top)
    const innerFit = railRingStackFit({ ...base, count: 5, room: innerRoom, leadingHeight: 44 })
    expect(innerFit.height).toBeNull()
    expect(innerFit.clearGap).toBe(12)
  })
})
