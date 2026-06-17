import { describe, expect, it } from 'vitest'
import { clampSelection, moveSelection } from './navigation-state'

describe('moveSelection', () => {
  it('moves within bounds', () => {
    expect(moveSelection(1, 1, 5)).toBe(2)
    expect(moveSelection(3, -1, 5)).toBe(2)
  })

  it('clamps at the top and bottom', () => {
    expect(moveSelection(0, -1, 5)).toBe(0)
    expect(moveSelection(4, 1, 5)).toBe(4)
  })

  it('stays at 0 for an empty list', () => {
    expect(moveSelection(0, 1, 0)).toBe(0)
    expect(moveSelection(3, -1, 0)).toBe(0)
  })
})

describe('clampSelection', () => {
  it('keeps a valid index unchanged', () => {
    expect(clampSelection(2, 5)).toBe(2)
  })

  it('pulls an out-of-range index back into a shrunk list', () => {
    expect(clampSelection(9, 3)).toBe(2)
  })

  it('returns 0 for an empty list', () => {
    expect(clampSelection(4, 0)).toBe(0)
  })
})
