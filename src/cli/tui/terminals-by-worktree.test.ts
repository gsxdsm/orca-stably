import { describe, expect, it } from 'vitest'
import { groupTerminalsByWorktree } from './terminals-by-worktree'

describe('groupTerminalsByWorktree', () => {
  it('groups terminals by worktree id, preserving order', () => {
    const map = groupTerminalsByWorktree([
      { handle: 'a', worktreeId: 'wt-1', title: 'one' },
      { handle: 'b', worktreeId: 'wt-2', title: 'two' },
      { handle: 'c', worktreeId: 'wt-1', title: null }
    ])
    expect(map.get('wt-1')).toEqual([
      { handle: 'a', title: 'one' },
      { handle: 'c', title: 'shell' }
    ])
    expect(map.get('wt-2')).toEqual([{ handle: 'b', title: 'two' }])
  })

  it('falls back to "shell" for empty/missing titles', () => {
    const map = groupTerminalsByWorktree([{ handle: 'a', worktreeId: 'wt-1', title: '' }])
    expect(map.get('wt-1')?.[0].title).toBe('shell')
  })
})
