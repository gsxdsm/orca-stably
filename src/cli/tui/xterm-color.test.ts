import { describe, expect, it } from 'vitest'
import { packedRgbToHex, paletteToHex } from './xterm-color'

describe('paletteToHex', () => {
  it('maps the basic 16 colors', () => {
    expect(paletteToHex(0)).toBe('#000000')
    expect(paletteToHex(1)).toBe('#800000')
    expect(paletteToHex(9)).toBe('#ff0000')
    expect(paletteToHex(15)).toBe('#ffffff')
  })

  it('maps the 6x6x6 cube', () => {
    expect(paletteToHex(16)).toBe('#000000') // cube origin
    expect(paletteToHex(196)).toBe('#ff0000') // bright red in the cube
    expect(paletteToHex(231)).toBe('#ffffff') // cube max
  })

  it('maps the grayscale ramp', () => {
    expect(paletteToHex(232)).toBe('#080808')
    expect(paletteToHex(255)).toBe('#eeeeee')
  })
})

describe('packedRgbToHex', () => {
  it('formats a packed 0xRRGGBB value', () => {
    expect(packedRgbToHex(0xff8800)).toBe('#ff8800')
    expect(packedRgbToHex(0x000000)).toBe('#000000')
    expect(packedRgbToHex(0x12abef)).toBe('#12abef')
  })
})
