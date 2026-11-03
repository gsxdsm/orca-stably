import { describe, expect, it } from 'vitest'
import { homeWorktreeForAgentPane } from './agent-pane-home-worktree'

function card(worktreeId: string, panes: [string, string | null][]) {
  return {
    worktreeId,
    agents: panes.map(([paneKey, parentPaneKey]) => ({ paneKey, parentPaneKey }))
  }
}

describe('homeWorktreeForAgentPane', () => {
  it('opens a mirrored worker in its own workspace, not the coordinator card', () => {
    const coordinator = 'tab-coord:leaf'
    const worker = 'tab-worker:leaf'
    const orca = card('folder:orca', [
      [coordinator, null],
      [worker, coordinator]
    ])
    const babysitter = card('folder:babysitter', [[worker, coordinator]])
    expect(homeWorktreeForAgentPane([orca, babysitter], worker, orca).worktreeId).toBe(
      'folder:babysitter'
    )
    expect(homeWorktreeForAgentPane([orca, babysitter], coordinator, orca).worktreeId).toBe(
      'folder:orca'
    )
  })

  it('keeps a same-workspace child on that card', () => {
    const cardOnly = card('folder:orca', [
      ['parent', null],
      ['child', 'parent']
    ])
    expect(homeWorktreeForAgentPane([cardOnly], 'child', cardOnly).worktreeId).toBe('folder:orca')
  })
})
