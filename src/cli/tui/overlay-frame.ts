import { style } from './ansi-control'
import { cellWidth, clipAnsi, fitCells, padCells, sliceCellsFrom } from './text-width'
import { keybindingHelp, type Platform } from './keybinding-map'

/** A modal drawn centered over the composed frame (help / confirm / prompt).
 *  Kept separate from layout so compose-frame stays focused on the dashboard. */
export type OverlayModel =
  | { kind: 'none' }
  | { kind: 'help'; platform: Platform }
  | { kind: 'confirm'; message: string }
  | { kind: 'prompt'; label: string; value: string }

type Box = { title: string; lines: string[] }

/** Stamp the overlay box over `base`, centered. The box is composited onto each
 *  row it occupies so the chrome to the left and right of the box still shows
 *  (only the box's own cells replace the base). Returns a new array. */
export function overlayRows(
  base: string[],
  overlay: OverlayModel,
  columns: number,
  rows: number,
  useColor: boolean
): string[] {
  if (overlay.kind === 'none') {
    return base
  }
  const box = boxFor(overlay)
  const inner = Math.max(box.title.length + 2, ...box.lines.map((line) => cellWidth(line)))
  const innerWidth = Math.min(columns - 4, inner)
  const boxWidth = innerWidth + 4
  const boxLines = drawBox(box, innerWidth, useColor)
  const top = Math.max(0, Math.floor((rows - boxLines.length) / 2))
  const left = Math.max(0, Math.floor((columns - boxWidth) / 2))
  const out = base.slice()
  for (let i = 0; i < boxLines.length; i += 1) {
    const rowIndex = top + i
    if (rowIndex >= 0 && rowIndex < rows) {
      const baseRow = out[rowIndex] ?? ''
      const leftPart = padCells(clipAnsi(baseRow, left), left)
      const rightPart = sliceCellsFrom(baseRow, left + boxWidth)
      out[rowIndex] = leftPart + boxLines[i] + rightPart
    }
  }
  return out
}

function boxFor(overlay: Exclude<OverlayModel, { kind: 'none' }>): Box {
  if (overlay.kind === 'help') {
    const lines = keybindingHelp(overlay.platform).map(
      (entry) => `${entry.keys.padEnd(10)} ${entry.hint}`
    )
    return { title: 'Help', lines: [...lines, '', 'press any key to close'] }
  }
  if (overlay.kind === 'confirm') {
    return { title: 'Confirm', lines: [overlay.message, '', 'y  yes      n  no'] }
  }
  return { title: 'Input', lines: [overlay.label, `> ${overlay.value}▏`] }
}

const H = '─'

function drawBox(box: Box, innerWidth: number, useColor: boolean): string[] {
  const titleBar = ` ${box.title} `
  const fill = Math.max(0, innerWidth + 2 - titleBar.length)
  const top = style(`╭${titleBar}${H.repeat(fill)}╮`, { fg: 'gray', bold: true }, useColor)
  const bottom = style(`╰${H.repeat(innerWidth + 2)}╯`, { fg: 'gray' }, useColor)
  const body = box.lines.map((line) => {
    const edge = style('│', { fg: 'gray' }, useColor)
    return `${edge} ${fitCells(line, innerWidth)} ${edge}`
  })
  return [top, ...body, bottom]
}
