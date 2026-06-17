import { describe, expect, it } from 'vitest'
import { buildWorktreeSnapshot, flattenWorktreeRows } from './worktree-snapshot'
import { makePsResult, makeWorktreeSummary } from './worktree-snapshot-fixtures'

describe('buildWorktreeSnapshot', () => {
  it('groups worktrees by repo, preserving first-seen order', () => {
    const snapshot = buildWorktreeSnapshot(
      makePsResult([
        makeWorktreeSummary({ worktreeId: 'a', repoId: 'r1', repo: 'web-app' }),
        makeWorktreeSummary({ worktreeId: 'b', repoId: 'r2', repo: 'infra' }),
        makeWorktreeSummary({ worktreeId: 'c', repoId: 'r1', repo: 'web-app' })
      ])
    )
    expect(snapshot.groups.map((g) => g.repoId)).toEqual(['r1', 'r2'])
    expect(snapshot.groups[0].worktrees.map((w) => w.worktreeId)).toEqual(['a', 'c'])
    expect(snapshot.groups[1].worktrees.map((w) => w.worktreeId)).toEqual(['b'])
  })

  it('returns an empty-but-valid model for an empty worktree', () => {
    const snapshot = buildWorktreeSnapshot(makePsResult([]))
    expect(snapshot.groups).toEqual([])
    expect(snapshot.totalCount).toBe(0)
    expect(flattenWorktreeRows(snapshot)).toEqual([])
  })

  it('maps a GitHub PR badge provider-agnostically', () => {
    const snapshot = buildWorktreeSnapshot(
      makePsResult([makeWorktreeSummary({ linkedPR: { number: 418, state: 'open' } })])
    )
    const row = flattenWorktreeRows(snapshot)[0]
    expect(row.badges.pr).toEqual({ number: 418, state: 'open' })
    expect(row.badges.gitLabMr).toBeNull()
    expect(row.badges.linearIssue).toBeNull()
  })

  it('maps a GitLab MR badge', () => {
    const snapshot = buildWorktreeSnapshot(
      makePsResult([makeWorktreeSummary({ linkedGitLabMR: 22 })])
    )
    const row = flattenWorktreeRows(snapshot)[0]
    expect(row.badges.gitLabMr).toBe(22)
    expect(row.badges.pr).toBeNull()
  })

  it('maps a Linear issue badge', () => {
    const snapshot = buildWorktreeSnapshot(
      makePsResult([makeWorktreeSummary({ linkedLinearIssue: 'STA-335' })])
    )
    expect(flattenWorktreeRows(snapshot)[0].badges.linearIssue).toBe('STA-335')
  })

  it('carries unread and live terminal count into badges', () => {
    const snapshot = buildWorktreeSnapshot(
      makePsResult([makeWorktreeSummary({ unread: true, liveTerminalCount: 3 })])
    )
    const row = flattenWorktreeRows(snapshot)[0]
    expect(row.badges.unread).toBe(true)
    expect(row.badges.liveTerminalCount).toBe(3)
  })

  it('flattens rows in sidebar render order', () => {
    const snapshot = buildWorktreeSnapshot(
      makePsResult([
        makeWorktreeSummary({ worktreeId: 'a', repoId: 'r1' }),
        makeWorktreeSummary({ worktreeId: 'b', repoId: 'r2' }),
        makeWorktreeSummary({ worktreeId: 'c', repoId: 'r1' })
      ])
    )
    expect(flattenWorktreeRows(snapshot).map((w) => w.worktreeId)).toEqual(['a', 'c', 'b'])
  })
})
