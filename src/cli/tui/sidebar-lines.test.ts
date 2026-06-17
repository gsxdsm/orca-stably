import { describe, expect, it } from 'vitest'
import { buildSidebarLines, rowIndexAtScreenRow } from './sidebar-lines'
import { buildWorktreeSnapshot } from './worktree-snapshot'
import { makePsResult, makeWorktreeSummary } from './worktree-snapshot-fixtures'

const snapshot = buildWorktreeSnapshot(
  makePsResult([
    makeWorktreeSummary({ worktreeId: 'a', repoId: 'r1', repo: 'web-app' }),
    makeWorktreeSummary({ worktreeId: 'b', repoId: 'r1', repo: 'web-app' }),
    makeWorktreeSummary({ worktreeId: 'c', repoId: 'r2', repo: 'infra' })
  ])
)

describe('buildSidebarLines', () => {
  it('lays out header, per-group spacer/header, then rows', () => {
    const kinds = buildSidebarLines(snapshot).map((line) => line.kind)
    expect(kinds).toEqual(['header', 'spacer', 'group', 'row', 'row', 'spacer', 'group', 'row'])
  })

  it('assigns flattened selection indices to row lines in order', () => {
    const rows = buildSidebarLines(snapshot).filter((line) => line.kind === 'row')
    expect(rows.map((line) => (line.kind === 'row' ? line.index : -1))).toEqual([0, 1, 2])
    expect(rows.map((line) => (line.kind === 'row' ? line.worktreeId : ''))).toEqual([
      'a',
      'b',
      'c'
    ])
  })

  it('returns only the header for an empty/absent snapshot', () => {
    expect(buildSidebarLines(null).map((l) => l.kind)).toEqual(['header'])
  })
})

describe('rowIndexAtScreenRow', () => {
  it('maps a click screen row to the worktree-row index, mirroring the layout', () => {
    const lines = buildSidebarLines(snapshot)
    // screen rows: 0 header, 1 spacer, 2 group, 3 row(a), 4 row(b), 5 spacer, 6 group, 7 row(c)
    expect(rowIndexAtScreenRow(lines, 3)).toBe(0)
    expect(rowIndexAtScreenRow(lines, 4)).toBe(1)
    expect(rowIndexAtScreenRow(lines, 7)).toBe(2)
  })

  it('returns null for header/group/spacer/gutter rows', () => {
    const lines = buildSidebarLines(snapshot)
    expect(rowIndexAtScreenRow(lines, 0)).toBeNull()
    expect(rowIndexAtScreenRow(lines, 2)).toBeNull()
    expect(rowIndexAtScreenRow(lines, 99)).toBeNull()
  })
})
