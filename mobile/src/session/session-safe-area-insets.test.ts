import { describe, expect, it } from 'vitest'
import { resolveSessionSafeAreaInsets } from './session-safe-area-insets'

const duoLandscape = { top: 0, right: 84, bottom: 34, left: 0 }

describe('resolveSessionSafeAreaInsets', () => {
  it('caps a tall bottom inset on a sideways iPhone', () => {
    expect(
      resolveSessionSafeAreaInsets(duoLandscape, {
        isIos: true,
        isLandscape: true,
        foldedFullWidth: false
      })
    ).toEqual({ ...duoLandscape, bottom: 21 })
  })

  it('drops the folded full-width dock to just above the home indicator', () => {
    expect(
      resolveSessionSafeAreaInsets(duoLandscape, {
        isIos: true,
        isLandscape: false,
        foldedFullWidth: true
      })
    ).toEqual({ ...duoLandscape, bottom: 14 })
  })

  it('keeps the inset in portrait and off iOS', () => {
    expect(
      resolveSessionSafeAreaInsets(duoLandscape, {
        isIos: true,
        isLandscape: false,
        foldedFullWidth: false
      })
    ).toBe(duoLandscape)
    expect(
      resolveSessionSafeAreaInsets(duoLandscape, {
        isIos: false,
        isLandscape: true,
        foldedFullWidth: true
      })
    ).toBe(duoLandscape)
  })
})
