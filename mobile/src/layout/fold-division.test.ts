import { describe, expect, it } from 'vitest'
import { foldPosture } from './fold-division'

describe('foldPosture', () => {
  it('reads no division as flat', () => {
    expect(foldPosture(null)).toEqual({ kind: 'flat' })
  })

  it('reads a band across the window as a laptop-style hinge', () => {
    expect(foldPosture({ x: 0, y: 320, width: 951, height: 28 })).toEqual({
      kind: 'stacked',
      topEnd: 320,
      bottomStart: 348
    })
  })

  it('reads a band down the window as a book-style hinge', () => {
    expect(foldPosture({ x: 320, y: 0, width: 28, height: 951 })).toEqual({
      kind: 'sideBySide',
      leftEnd: 320,
      rightStart: 348
    })
  })
})
