import { clipAnsi, sliceCellsFrom } from './text-width'
import type { LogicalKey } from './tty-key-adapter'

const INVERSE = '\x1b[7m'
const RESET = '\x1b[0m'

/** Per-line transform (e.g. syntax highlighting) applied before the cursor cell. */
export type LineDecorator = (line: string) => string
const identity: LineDecorator = (line) => line

/** An in-memory text buffer with a cursor, for the read/write file view. Pure
 *  editing logic (no I/O): the pane owns load/save via files.read/files.write. */
export class FileEditor {
  private lines: string[] = ['']
  private row = 0
  private col = 0
  private baseline = ''

  load(content: string): void {
    this.lines = content.length === 0 ? [''] : content.split('\n')
    this.baseline = content
    this.row = 0
    this.col = 0
  }

  get content(): string {
    return this.lines.join('\n')
  }

  get dirty(): boolean {
    return this.content !== this.baseline
  }

  get cursorRow(): number {
    return this.row
  }

  get lineCount(): number {
    return this.lines.length
  }

  markSaved(): void {
    this.baseline = this.content
  }

  revert(): void {
    this.load(this.baseline)
  }

  /** Place the cursor from a click at a buffer (row, col), clamped into range. */
  setCursor(row: number, col: number): void {
    this.row = Math.min(Math.max(row, 0), this.lines.length - 1)
    this.col = Math.min(Math.max(col, 0), this.lines[this.row].length)
  }

  /** Apply an editing key; returns true if it changed the buffer or cursor. */
  handleKey(key: LogicalKey): boolean {
    if (key.type === 'char') {
      this.insert(key.value)
    } else if (key.type === 'tab') {
      this.insert('  ')
    } else if (key.type === 'enter') {
      this.newline()
    } else if (key.type === 'backspace') {
      this.backspace()
    } else if (
      key.type === 'up' ||
      key.type === 'down' ||
      key.type === 'left' ||
      key.type === 'right'
    ) {
      this.move(key.type)
    } else {
      return false
    }
    return true
  }

  private insert(text: string): void {
    const line = this.lines[this.row]
    this.lines[this.row] = line.slice(0, this.col) + text + line.slice(this.col)
    this.col += text.length
  }

  private newline(): void {
    const line = this.lines[this.row]
    this.lines.splice(this.row, 1, line.slice(0, this.col), line.slice(this.col))
    this.row += 1
    this.col = 0
  }

  private backspace(): void {
    if (this.col > 0) {
      const line = this.lines[this.row]
      this.lines[this.row] = line.slice(0, this.col - 1) + line.slice(this.col)
      this.col -= 1
    } else if (this.row > 0) {
      const prev = this.lines[this.row - 1]
      this.col = prev.length
      this.lines[this.row - 1] = prev + this.lines[this.row]
      this.lines.splice(this.row, 1)
      this.row -= 1
    }
  }

  private move(dir: 'up' | 'down' | 'left' | 'right'): void {
    if (dir === 'left') {
      if (this.col > 0) {
        this.col -= 1
      } else if (this.row > 0) {
        this.row -= 1
        this.col = this.lines[this.row].length
      }
    } else if (dir === 'right') {
      if (this.col < this.lines[this.row].length) {
        this.col += 1
      } else if (this.row < this.lines.length - 1) {
        this.row += 1
        this.col = 0
      }
    } else if (dir === 'up' && this.row > 0) {
      this.row -= 1
      this.col = Math.min(this.col, this.lines[this.row].length)
    } else if (dir === 'down' && this.row < this.lines.length - 1) {
      this.row += 1
      this.col = Math.min(this.col, this.lines[this.row].length)
    }
  }

  /** The buffer as screen lines, optionally decorated (syntax highlighting),
   *  with the cursor cell drawn inverse over the decorated text. */
  renderLines(decorate: LineDecorator = identity): string[] {
    return this.lines.map((line, i) =>
      i === this.row ? this.cursorLine(decorate(line), line) : decorate(line)
    )
  }

  /** Invert the cursor cell on the (possibly colored) rendered line. Splices in
   *  visible-cell space so it survives the decorator's SGR codes. */
  private cursorLine(rendered: string, raw: string): string {
    const at = this.col < raw.length ? raw[this.col] : ' '
    const before = clipAnsi(rendered, this.col)
    const after = sliceCellsFrom(rendered, this.col + 1)
    return `${before}${INVERSE}${at}${RESET}${after}`
  }
}
