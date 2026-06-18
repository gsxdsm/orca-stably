/** Convert xterm cell colors (palette index or packed RGB) to hex strings Ink
 *  can render. Pure so it's unit-testable without a terminal. */

function rgbHex(r: number, g: number, b: number): string {
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/** Standard 16-color VGA/xterm palette. */
const BASE_16 = [
  '#000000',
  '#800000',
  '#008000',
  '#808000',
  '#000080',
  '#800080',
  '#008080',
  '#c0c0c0',
  '#808080',
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#0000ff',
  '#ff00ff',
  '#00ffff',
  '#ffffff'
]

function buildPalette(): string[] {
  const palette = [...BASE_16]
  // 6x6x6 color cube (indices 16-231).
  const step = (c: number): number => (c === 0 ? 0 : 55 + c * 40)
  for (let index = 16; index < 232; index += 1) {
    const n = index - 16
    palette.push(rgbHex(step(Math.floor(n / 36)), step(Math.floor((n % 36) / 6)), step(n % 6)))
  }
  // Grayscale ramp (indices 232-255).
  for (let index = 232; index < 256; index += 1) {
    const value = 8 + (index - 232) * 10
    palette.push(rgbHex(value, value, value))
  }
  return palette
}

const PALETTE_256 = buildPalette()

/** Map an xterm 256-palette index to a hex color. */
export function paletteToHex(index: number): string {
  return PALETTE_256[index] ?? '#ffffff'
}

/** Convert a packed 0xRRGGBB number (xterm RGB color) to a hex string. */
export function packedRgbToHex(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`
}
