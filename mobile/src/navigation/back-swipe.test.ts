import { describe, expect, it } from 'vitest'
import { backSwipeCommits, backSwipeDirection } from './back-swipe'

describe('interactive back swipe intent', () => {
  it('waits for intent and rejects leftward or vertical movement', () => {
    expect(backSwipeDirection(8, 4)).toBe('wait')
    expect(backSwipeDirection(24, 8)).toBe('back')
    expect(backSwipeDirection(-30, 0)).toBe('reject')
    expect(backSwipeDirection(24, 30)).toBe('reject')
    expect(backSwipeDirection(15, 12)).toBe('reject')
  })

  it('commits distance or a meaningful flick, but cancels reversal and early release', () => {
    expect(backSwipeCommits(0.6, 0)).toBe(true)
    expect(backSwipeCommits(0.15, 0.7)).toBe(true)
    expect(backSwipeCommits(0.04, 2)).toBe(false)
    expect(backSwipeCommits(0.3, 0)).toBe(false)
    expect(backSwipeCommits(0.7, -0.5)).toBe(false)
  })
})
