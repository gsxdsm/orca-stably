import { describe, expect, it } from 'vitest'
import { isTouchLikePointerType, shouldToggleViewModeFromLongPress } from './tab-long-press-toggle'

describe('isTouchLikePointerType', () => {
  it('treats touch and pen as long-press-capable', () => {
    expect(isTouchLikePointerType('touch')).toBe(true)
    expect(isTouchLikePointerType('pen')).toBe(true)
  })

  it('treats mouse and unknown/empty as not long-press-capable', () => {
    expect(isTouchLikePointerType('mouse')).toBe(false)
    expect(isTouchLikePointerType('')).toBe(false)
    expect(isTouchLikePointerType(undefined)).toBe(false)
    expect(isTouchLikePointerType(null)).toBe(false)
  })
})

describe('shouldToggleViewModeFromLongPress', () => {
  it('toggles on a touch long-press of an eligible agent tab', () => {
    expect(shouldToggleViewModeFromLongPress('touch', true)).toBe(true)
    expect(shouldToggleViewModeFromLongPress('pen', true)).toBe(true)
  })

  it('does not toggle a mouse right-click (keeps the context menu)', () => {
    expect(shouldToggleViewModeFromLongPress('mouse', true)).toBe(false)
  })

  it('does not toggle a non-eligible tab even on touch (keeps the context menu)', () => {
    expect(shouldToggleViewModeFromLongPress('touch', false)).toBe(false)
  })
})
