import { describe, expect, it } from 'vitest'
import { placePullDownMenu } from './pull-down-menu-placement'

const DUO_FOLDED = { width: 466, height: 900 }
const DUO_INSETS = { top: 47, right: 84, bottom: 34, left: 0 }

describe('placePullDownMenu', () => {
  it('right-aligns the menu under a header button left of the Duo status column', () => {
    const placement = placePullDownMenu({
      anchor: { x: 332, y: 26, width: 36, height: 36 },
      layer: DUO_FOLDED,
      insets: DUO_INSETS
    })
    expect(placement).toEqual({ left: 116, width: 252, top: 68, maxHeight: 790, origin: 'top' })
  })

  it('keeps the menu on screen when the anchor is measured far left of where it is drawn', () => {
    // The owner's report: anchor read 139pt (30% of the window) left of the visible button.
    const placement = placePullDownMenu({
      anchor: { x: 193, y: 26, width: 36, height: 36 },
      layer: DUO_FOLDED,
      insets: DUO_INSETS
    })
    expect(placement.left).toBe(8)
  })

  it('keeps clear of the status column and narrows on a window thinner than the menu', () => {
    const wide = placePullDownMenu({
      anchor: { x: 420, y: 26, width: 36, height: 36 },
      layer: DUO_FOLDED,
      insets: DUO_INSETS
    })
    expect(wide.left + wide.width).toBe(374)
    const narrow = placePullDownMenu({
      anchor: { x: 180, y: 26, width: 36, height: 36 },
      layer: { width: 220, height: 600 },
      insets: { top: 0, right: 0, bottom: 0, left: 0 }
    })
    expect(narrow).toMatchObject({ left: 8, width: 204 })
  })

  it('opens upward from a button in the lower half', () => {
    const placement = placePullDownMenu({
      anchor: { x: 332, y: 800, width: 36, height: 36 },
      layer: DUO_FOLDED,
      insets: DUO_INSETS
    })
    expect(placement).toMatchObject({ bottom: 106, maxHeight: 739, origin: 'bottom' })
  })
})
