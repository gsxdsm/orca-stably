import { describe, expect, it } from 'vitest'
import { paneHeights, paneIndexAtRow, visibleTailLines } from './pane-layout'

describe('paneHeights', () => {
  it('splits rows evenly, remainder to the earliest panes', () => {
    expect(paneHeights(2, 10)).toEqual([5, 5])
    expect(paneHeights(3, 10)).toEqual([4, 3, 3])
    expect(paneHeights(1, 7)).toEqual([7])
  })

  it('returns empty for non-positive inputs', () => {
    expect(paneHeights(0, 10)).toEqual([])
    expect(paneHeights(2, 0)).toEqual([])
  })
})

describe('visibleTailLines', () => {
  const lines = ['a', 'b', 'c', 'd', 'e']

  it('shows the last `height` lines at offset 0', () => {
    expect(visibleTailLines(lines, 2, 0)).toEqual(['d', 'e'])
  })

  it('scrolls back by the offset', () => {
    expect(visibleTailLines(lines, 2, 1)).toEqual(['c', 'd'])
  })

  it('clamps to available lines', () => {
    expect(visibleTailLines(lines, 10, 0)).toEqual(lines)
    expect(visibleTailLines(lines, 0, 0)).toEqual([])
  })
})

describe('paneIndexAtRow', () => {
  // available=10, 2 panes: bodyRows = max(2, 10-2) = 8 -> heights [4,4].
  // Each pane = 1 title + 4 body = 5 rows. pane 0 -> rows 0..4, pane 1 -> 5..9.
  it('maps a row to the pane that contains it', () => {
    expect(paneIndexAtRow(2, 10, 0)).toBe(0)
    expect(paneIndexAtRow(2, 10, 4)).toBe(0)
    expect(paneIndexAtRow(2, 10, 5)).toBe(1)
    expect(paneIndexAtRow(2, 10, 9)).toBe(1)
  })

  it('clamps out-of-range rows to a valid pane', () => {
    expect(paneIndexAtRow(2, 10, -5)).toBe(0)
    expect(paneIndexAtRow(2, 10, 999)).toBe(1)
  })

  it('returns 0 when there are no panes', () => {
    expect(paneIndexAtRow(0, 10, 3)).toBe(0)
  })
})
