import { describe, expect, it } from 'vitest'
import { cellWidth, clipAnsi, fitCells, padCells } from './text-width'

const ESC = '\x1b'
const RED = `${ESC}[31m`
const RESET = `${ESC}[0m`

describe('cellWidth', () => {
  it('ignores ANSI escapes', () => {
    expect(cellWidth(`${RED}hello${RESET}`)).toBe(5)
  })

  it('counts wide (CJK) glyphs as two cells', () => {
    expect(cellWidth('日本')).toBe(4)
  })
})

describe('clipAnsi', () => {
  it('truncates by visible width, not byte length', () => {
    expect(cellWidth(clipAnsi(`${RED}hello world${RESET}`, 5))).toBe(5)
  })

  it('re-closes an open SGR run at the cut', () => {
    const clipped = clipAnsi(`${RED}hello world`, 3)
    expect(clipped.startsWith(RED)).toBe(true)
    expect(clipped.endsWith(RESET)).toBe(true)
    expect(cellWidth(clipped)).toBe(3)
  })

  it('does not split a wide glyph across the boundary', () => {
    // Width 3 can't fit the second wide glyph (would need 4); stops at 2.
    expect(cellWidth(clipAnsi('日本', 3))).toBe(2)
  })
})

describe('fitCells', () => {
  it('pads short text to exact width', () => {
    expect(fitCells('hi', 5)).toBe('hi   ')
  })

  it('truncates long text to exact width', () => {
    expect(cellWidth(fitCells('hello world', 5))).toBe(5)
  })
})

describe('padCells', () => {
  it('fills a styled line to width without counting escapes', () => {
    const padded = padCells(`${RED}ab${RESET}`, 5)
    expect(cellWidth(padded)).toBe(5)
  })
})
