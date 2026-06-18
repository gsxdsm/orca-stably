import { clipAnsi, fitCells, padCells } from './text-width'
import type { TerminalAnsiFrame } from './terminal-ansi-source'

/** Turn the focused terminal's frame into exactly `height` rows of exactly
 *  `width` visible cells, for placement in the viewport rectangle.
 *
 *  When ANSI data is present we slice it VERBATIM (byte-for-byte) — split into
 *  screen lines, take the bottom `height`, and clip each to `width` with an
 *  ANSI-aware slice that never splits an escape. No re-parsing through a
 *  terminal emulator: the runtime already serialized a faithful SGR screen. */
export function viewportRows(frame: TerminalAnsiFrame, width: number, height: number): string[] {
  if (width <= 0 || height <= 0) {
    return []
  }
  const lines = frameLines(frame)
  if (lines.length === 0) {
    return placeholder(frame, width, height)
  }
  const start = Math.max(0, lines.length - height)
  const visible = lines.slice(start)
  const rows: string[] = []
  for (const line of visible) {
    rows.push(padCells(clipAnsi(line, width), width))
  }
  while (rows.length < height) {
    rows.push(' '.repeat(width))
  }
  return rows
}

/** The terminal's screen lines, newest last. Trailing blank lines are dropped so
 *  the live output sits at the bottom of the viewport (where a shell prompt is)
 *  rather than scrolled up by the serializer's full-height padding. */
function frameLines(frame: TerminalAnsiFrame): string[] {
  if (frame.data !== null) {
    // Split into screen lines without a control-char regex (lint: no-control-regex).
    const split = frame.data
      .split('\r\n')
      .join('\n')
      .split('\n')
      .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
    return trimTrailingBlank(split)
  }
  return trimTrailingBlank(frame.plainLines.slice())
}

function trimTrailingBlank(lines: string[]): string[] {
  let end = lines.length
  while (end > 0 && clipAnsi(lines[end - 1], 1000).trim().length === 0) {
    end -= 1
  }
  return lines.slice(0, end)
}

function placeholder(frame: TerminalAnsiFrame, width: number, height: number): string[] {
  // When the runtime lacks terminal.readAnsi the verbatim screen is unavailable
  // and the plain tail is usually empty — say so (and how to fix) rather than
  // implying the terminal itself produced nothing.
  const lines = frame.ansiUnsupported
    ? ['terminal screen needs a newer Orca runtime', 'rebuild & restart Orca to see live output']
    : [frame.connected ? 'no terminal output yet' : 'connecting…']
  const rows: string[] = []
  const top = Math.max(0, Math.floor((height - lines.length) / 2))
  for (let i = 0; i < height; i += 1) {
    const line = lines[i - top]
    rows.push(line ? fitCells(`  ${line}`, width) : ' '.repeat(width))
  }
  return rows
}
