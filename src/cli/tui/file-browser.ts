import { style } from './ansi-control'
import { fitCells } from './text-width'

export type FileEntry = { relativePath: string; basename: string }

/** State of the Files browser panel: open flag, the worktree's file list, the
 *  type-to-filter query, and the selected (filtered) index. */
export type FileBrowserState = {
  open: boolean
  query: string
  files: FileEntry[]
  index: number
}

export function emptyFileBrowser(): FileBrowserState {
  return { open: false, query: '', files: [], index: 0 }
}

/** Files matching the query (case-insensitive substring on the path), capped so
 *  a huge tree stays responsive. */
export function filteredFiles(state: FileBrowserState, limit = 500): FileEntry[] {
  const q = state.query.trim().toLowerCase()
  const matches = q
    ? state.files.filter((file) => file.relativePath.toLowerCase().includes(q))
    : state.files
  return matches.slice(0, limit)
}

/** Clamp an index into the filtered list. */
export function clampFileIndex(state: FileBrowserState): number {
  const count = filteredFiles(state).length
  return count === 0 ? 0 : Math.min(Math.max(state.index, 0), count - 1)
}

/** The currently-selected file, or null. */
export function selectedFile(state: FileBrowserState): FileEntry | null {
  return filteredFiles(state)[clampFileIndex(state)] ?? null
}

/** Map a 0-based row within the panel body (below header + query) to a filtered
 *  file index, honoring the scroll window — for click-to-open. */
export function fileIndexAtBodyRow(
  state: FileBrowserState,
  bodyRow: number,
  bodyHeight: number
): number | null {
  const start = windowStartFor(clampFileIndex(state), filteredFiles(state).length, bodyHeight)
  const index = start + bodyRow
  return index >= 0 && index < filteredFiles(state).length ? index : null
}

function windowStartFor(selected: number, total: number, capacity: number): number {
  if (capacity <= 0 || total <= capacity) {
    return 0
  }
  return Math.min(Math.max(selected - Math.floor(capacity / 2), 0), total - capacity)
}

/** Render the right-side Files panel as exactly `height` rows of `width` cells:
 *  a header, the filter query, then the windowed file list. */
export function fileBrowserRows(
  state: FileBrowserState,
  width: number,
  height: number,
  useColor: boolean
): string[] {
  const files = filteredFiles(state)
  const selected = clampFileIndex(state)
  const rows: string[] = [
    style(fitCells(' Files', width), { bg: 'white', fg: 'black', bold: true }, useColor),
    style(fitCells(` / ${state.query}▏`, width), { dim: true }, useColor)
  ]
  const bodyHeight = Math.max(0, height - rows.length)
  const start = windowStartFor(selected, files.length, bodyHeight)
  for (let i = 0; i < bodyHeight; i += 1) {
    const file = files[start + i]
    if (!file) {
      rows.push(' '.repeat(width))
      continue
    }
    const isSel = start + i === selected
    rows.push(
      style(
        fitCells(`  ${file.relativePath}`, width),
        isSel ? { inverse: true, bold: true } : {},
        useColor
      )
    )
  }
  return rows.slice(0, height)
}
