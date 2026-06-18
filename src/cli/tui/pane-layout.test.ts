import { describe, expect, it } from 'vitest'
import { tabHandleAtColumn, tabRegions, truncateTabLabel, visibleTailLines } from './pane-layout'

describe('truncateTabLabel', () => {
  it('keeps short titles, falling back to shell for blanks', () => {
    expect(truncateTabLabel('claude')).toBe('claude')
    expect(truncateTabLabel('   ')).toBe('shell')
  })

  it('truncates long titles with an ellipsis', () => {
    expect(truncateTabLabel('a very long terminal title here', 10)).toBe('a very lo…')
  })
})

describe('tabRegions / tabHandleAtColumn', () => {
  // ` a ` (3) + ` bb ` (4) starting at x=20: a -> [20,23), bb -> [23,27).
  const tabs = [
    { handle: 'a', label: 'a' },
    { handle: 'bb', label: 'bb' }
  ]

  it('lays tabs out left to right with one space of padding', () => {
    expect(tabRegions(tabs, 20)).toEqual([
      { handle: 'a', x: 20, width: 3 },
      { handle: 'bb', x: 23, width: 4 }
    ])
  })

  it('resolves a click column to the tab under it', () => {
    const regions = tabRegions(tabs, 20)
    expect(tabHandleAtColumn(regions, 21)).toBe('a')
    expect(tabHandleAtColumn(regions, 23)).toBe('bb')
    expect(tabHandleAtColumn(regions, 26)).toBe('bb')
    expect(tabHandleAtColumn(regions, 27)).toBeNull()
    expect(tabHandleAtColumn(regions, 5)).toBeNull()
  })
})

describe('visibleTailLines', () => {
  const lines = ['a', 'b', 'c', 'd', 'e']

  it('shows the last `height` lines at offset 0', () => {
    expect(visibleTailLines(lines, 2, 0)).toEqual(['d', 'e'])
  })

  it('scrolls back by the offset and clamps to available lines', () => {
    expect(visibleTailLines(lines, 2, 1)).toEqual(['c', 'd'])
    expect(visibleTailLines(lines, 10, 0)).toEqual(lines)
    expect(visibleTailLines(lines, 0, 0)).toEqual([])
  })
})
