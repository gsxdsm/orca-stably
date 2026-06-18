import { describe, expect, it } from 'vitest'
import {
  clampFileIndex,
  emptyFileBrowser,
  fileBrowserRows,
  fileIndexAtBodyRow,
  filteredFiles,
  selectedFile,
  type FileBrowserState
} from './file-browser'

function state(over: Partial<FileBrowserState> = {}): FileBrowserState {
  return {
    open: true,
    query: '',
    files: [
      { relativePath: 'src/a.ts', basename: 'a.ts' },
      { relativePath: 'src/b.ts', basename: 'b.ts' },
      { relativePath: 'docs/readme.md', basename: 'readme.md' }
    ],
    index: 0,
    ...over
  }
}

describe('filteredFiles', () => {
  it('filters by case-insensitive path substring', () => {
    expect(filteredFiles(state({ query: 'README' })).map((f) => f.basename)).toEqual(['readme.md'])
    expect(filteredFiles(state({ query: 'src/' }))).toHaveLength(2)
  })
})

describe('clampFileIndex / selectedFile', () => {
  it('clamps the selection into the filtered list', () => {
    expect(clampFileIndex(state({ index: 99 }))).toBe(2)
    expect(selectedFile(state({ query: 'b' }))?.basename).toBe('b.ts')
  })
})

describe('fileIndexAtBodyRow', () => {
  it('maps a body row to a filtered index within the window', () => {
    expect(fileIndexAtBodyRow(state(), 0, 10)).toBe(0)
    expect(fileIndexAtBodyRow(state(), 2, 10)).toBe(2)
    expect(fileIndexAtBodyRow(state(), 5, 10)).toBeNull()
  })
})

describe('fileBrowserRows', () => {
  it('renders header, query, and the file list at the given size', () => {
    const rows = fileBrowserRows(state({ query: 'a' }), 30, 6, false)
    expect(rows).toHaveLength(6)
    expect(rows[0]).toContain('Files')
    expect(rows[1]).toContain('/ a')
    expect(rows.join('\n')).toContain('src/a.ts')
  })

  it('shows nothing but chrome when empty', () => {
    const rows = fileBrowserRows(emptyFileBrowser(), 20, 4, false)
    expect(rows).toHaveLength(4)
  })
})
