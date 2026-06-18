import { Terminal } from '@xterm/headless'
import type { IBufferCell, IBufferLine } from '@xterm/headless'
import { packedRgbToHex, paletteToHex } from './xterm-color'
import type { StyledLine, StyledSpan } from './terminal-screen'

function cellColor(isDefault: boolean, isRgb: boolean, value: number): string | undefined {
  if (isDefault) {
    return undefined
  }
  return isRgb ? packedRgbToHex(value) : paletteToHex(value)
}

function readLine(line: IBufferLine, cols: number): StyledLine {
  const spans: StyledSpan[] = []
  let current: StyledSpan | null = null
  for (let x = 0; x < cols; x += 1) {
    const cell: IBufferCell | undefined = line.getCell(x)
    if (!cell) {
      continue
    }
    const width = cell.getWidth()
    if (width === 0) {
      continue // trailing half of a wide character
    }
    const chars = cell.getChars().length > 0 ? cell.getChars() : ' '
    const fg = cellColor(cell.isFgDefault(), cell.isFgRGB(), cell.getFgColor())
    const bg = cellColor(cell.isBgDefault(), cell.isBgRGB(), cell.getBgColor())
    const bold = cell.isBold() !== 0
    const dim = cell.isDim() !== 0
    const italic = cell.isItalic() !== 0
    const underline = cell.isUnderline() !== 0
    const inverse = cell.isInverse() !== 0
    if (
      current &&
      current.fg === fg &&
      current.bg === bg &&
      current.bold === bold &&
      current.dim === dim &&
      current.italic === italic &&
      current.underline === underline &&
      current.inverse === inverse
    ) {
      current.text += chars
    } else {
      current = { text: chars, fg, bg, bold, dim, italic, underline, inverse }
      spans.push(current)
    }
  }
  // Trim trailing unstyled whitespace so rows don't carry full-width padding.
  const last = current
  if (last && !last.bg && !last.inverse) {
    last.text = last.text.replace(/\s+$/, '')
    if (last.text.length === 0) {
      spans.pop()
    }
  }
  return spans
}

/** Feeds an ANSI/SGR snapshot through a headless xterm and reads the visible
 *  screen back as styled lines Ink can render with color. One instance is
 *  reused across snapshots (reset + write each time). */
export class AnsiScreen {
  private terminal: Terminal | null = null
  private cols = 0
  private rows = 0

  private ensure(cols: number, rows: number): Terminal {
    if (!this.terminal) {
      this.terminal = new Terminal({ cols, rows, scrollback: 0, allowProposedApi: true })
      this.cols = cols
      this.rows = rows
      return this.terminal
    }
    if (cols !== this.cols || rows !== this.rows) {
      this.terminal.resize(cols, rows)
      this.cols = cols
      this.rows = rows
    }
    return this.terminal
  }

  async render(data: string, cols: number, rows: number): Promise<StyledLine[]> {
    const terminal = this.ensure(Math.max(1, cols), Math.max(1, rows))
    terminal.reset()
    await new Promise<void>((resolve) => {
      terminal.write(data, () => resolve())
    })

    const buffer = terminal.buffer.active
    const start = Math.max(0, buffer.length - terminal.rows)
    const lines: StyledLine[] = []
    let lastNonEmpty = -1
    for (let y = start; y < buffer.length; y += 1) {
      const line = buffer.getLine(y)
      const styled = line ? readLine(line, terminal.cols) : []
      if (styled.length > 0) {
        lastNonEmpty = lines.length
      }
      lines.push(styled)
    }
    // Drop trailing blank rows so the pane isn't padded with empty lines.
    return lines.slice(0, lastNonEmpty + 1)
  }

  dispose(): void {
    this.terminal?.dispose()
    this.terminal = null
  }
}
