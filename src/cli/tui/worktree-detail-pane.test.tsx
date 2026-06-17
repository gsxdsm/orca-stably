import React from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { WorktreeDetailPane } from './worktree-detail-pane'
import { TerminalTailView } from './terminal-tail-view'
import { buildWorktreeSnapshot, flattenWorktreeRows } from './worktree-snapshot'
import { emptyTerminalTailState, type TerminalTailState } from './terminal-stream'
import { makeAgentRow, makePsResult, makeWorktreeSummary } from './worktree-snapshot-fixtures'

function rowWith(overrides = {}) {
  return flattenWorktreeRows(
    buildWorktreeSnapshot(makePsResult([makeWorktreeSummary(overrides)]))
  )[0]
}

function tail(overrides: Partial<TerminalTailState> = {}): TerminalTailState {
  return { ...emptyTerminalTailState('term_1'), connected: true, status: 'running', ...overrides }
}

describe('WorktreeDetailPane', () => {
  it('prompts to select a worktree when none is given', () => {
    const { lastFrame } = render(<WorktreeDetailPane row={null} tail={null} />)
    expect(lastFrame()).toContain('Select a worktree')
  })

  it('renders worktree name, branch, and agent rows', () => {
    const row = rowWith({
      displayName: 'feature/checkout',
      branch: 'feature/checkout',
      agents: [makeAgentRow({ agentType: 'claude', state: 'working', prompt: 'wire the modal' })]
    })
    const { lastFrame } = render(<WorktreeDetailPane row={row} tail={null} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('feature/checkout')
    expect(frame).toContain('claude')
    expect(frame).toContain('working')
    expect(frame).toContain('wire the modal')
  })

  it('shows "none" when a worktree has no agents', () => {
    const { lastFrame } = render(<WorktreeDetailPane row={rowWith({ agents: [] })} tail={null} />)
    expect(lastFrame()).toContain('none')
  })
})

describe('TerminalTailView', () => {
  it('renders trailing output lines', () => {
    const { lastFrame } = render(
      <TerminalTailView tail={tail({ lines: ['running tests…', '✓ 41 passed'] })} />
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('running tests…')
    expect(frame).toContain('✓ 41 passed')
  })

  it('shows a degraded message for remote PTYs with no snapshot', () => {
    const { lastFrame } = render(<TerminalTailView tail={tail({ degraded: true })} />)
    expect(lastFrame()).toContain('unavailable')
  })

  it('marks an exited process', () => {
    const { lastFrame } = render(
      <TerminalTailView tail={tail({ status: 'exited', lines: ['done'] })} />
    )
    expect(lastFrame()).toContain('exited')
  })

  it('notes a truncated buffer', () => {
    const { lastFrame } = render(
      <TerminalTailView tail={tail({ truncated: true, lines: ['x'] })} />
    )
    expect(lastFrame()).toContain('truncated')
  })
})
