import { describe, expect, it } from 'vitest'
import { buildHerdSnapshot, flattenHerdRows } from './herd-view-model'
import { makePsResult, makeWorktreeSummary } from './herd-fixtures'

describe('buildHerdSnapshot', () => {
  it('groups worktrees by repo, preserving first-seen order', () => {
    const snapshot = buildHerdSnapshot(
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

  it('returns an empty-but-valid model for an empty herd', () => {
    const snapshot = buildHerdSnapshot(makePsResult([]))
    expect(snapshot.groups).toEqual([])
    expect(snapshot.totalCount).toBe(0)
    expect(flattenHerdRows(snapshot)).toEqual([])
  })

  it('maps a GitHub PR badge provider-agnostically', () => {
    const snapshot = buildHerdSnapshot(
      makePsResult([makeWorktreeSummary({ linkedPR: { number: 418, state: 'open' } })])
    )
    const row = flattenHerdRows(snapshot)[0]
    expect(row.badges.pr).toEqual({ number: 418, state: 'open' })
    expect(row.badges.gitLabMr).toBeNull()
    expect(row.badges.linearIssue).toBeNull()
  })

  it('maps a GitLab MR badge', () => {
    const snapshot = buildHerdSnapshot(makePsResult([makeWorktreeSummary({ linkedGitLabMR: 22 })]))
    const row = flattenHerdRows(snapshot)[0]
    expect(row.badges.gitLabMr).toBe(22)
    expect(row.badges.pr).toBeNull()
  })

  it('maps a Linear issue badge', () => {
    const snapshot = buildHerdSnapshot(
      makePsResult([makeWorktreeSummary({ linkedLinearIssue: 'STA-335' })])
    )
    expect(flattenHerdRows(snapshot)[0].badges.linearIssue).toBe('STA-335')
  })

  it('carries unread and live terminal count into badges', () => {
    const snapshot = buildHerdSnapshot(
      makePsResult([makeWorktreeSummary({ unread: true, liveTerminalCount: 3 })])
    )
    const row = flattenHerdRows(snapshot)[0]
    expect(row.badges.unread).toBe(true)
    expect(row.badges.liveTerminalCount).toBe(3)
  })

  it('flattens rows in sidebar render order', () => {
    const snapshot = buildHerdSnapshot(
      makePsResult([
        makeWorktreeSummary({ worktreeId: 'a', repoId: 'r1' }),
        makeWorktreeSummary({ worktreeId: 'b', repoId: 'r2' }),
        makeWorktreeSummary({ worktreeId: 'c', repoId: 'r1' })
      ])
    )
    expect(flattenHerdRows(snapshot).map((w) => w.worktreeId)).toEqual(['a', 'c', 'b'])
  })
})
