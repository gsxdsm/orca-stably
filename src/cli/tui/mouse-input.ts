/** SGR mouse reporting (https://invisible-island.net/xterm/ctlseqs/ctlseqs.html).
 *  1000h = button events; 1006h = SGR extended coordinates (handles columns
 *  past 223, unlike legacy encoding). Disabled in the reverse order on exit. */
export const MOUSE_ENABLE = '\x1b[?1000h\x1b[?1006h'
export const MOUSE_DISABLE = '\x1b[?1006l\x1b[?1000l'

export type MouseEvent =
  | { type: 'press'; button: 'left' | 'middle' | 'right'; col: number; row: number }
  | { type: 'release'; col: number; row: number }
  | { type: 'scroll'; direction: 'up' | 'down'; col: number; row: number }

const SGR_MOUSE_PREFIX = '\x1b[<'
const WHEEL_FLAG = 64
const BUTTONS = ['left', 'middle', 'right'] as const

/** Parse one SGR mouse report into a structured event, or null if `data` is not
 *  a mouse report (so it can be handed to the key decoder instead). Coordinates
 *  are converted from the protocol's 1-based to 0-based for hit-testing.
 *  Parsed by hand rather than regex to avoid a control character in a pattern. */
export function parseMouseEvent(data: string): MouseEvent | null {
  if (!data.startsWith(SGR_MOUSE_PREFIX) || data.length < 5) {
    return null
  }
  const isPress = data.endsWith('M')
  if (!isPress && !data.endsWith('m')) {
    return null
  }
  const fields = data.slice(SGR_MOUSE_PREFIX.length, -1).split(';')
  if (fields.length !== 3) {
    return null
  }
  const code = Number(fields[0])
  const rawCol = Number(fields[1])
  const rawRow = Number(fields[2])
  if (!Number.isInteger(code) || !Number.isInteger(rawCol) || !Number.isInteger(rawRow)) {
    return null
  }

  const col = rawCol - 1
  const row = rawRow - 1

  if ((code & WHEEL_FLAG) !== 0) {
    // 64 = wheel up, 65 = wheel down.
    return { type: 'scroll', direction: (code & 1) === 0 ? 'up' : 'down', col, row }
  }

  if (!isPress) {
    return { type: 'release', col, row }
  }

  const button = BUTTONS[code & 3]
  if (!button) {
    return null
  }
  return { type: 'press', button, col, row }
}
