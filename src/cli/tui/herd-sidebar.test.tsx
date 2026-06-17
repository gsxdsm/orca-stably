import React from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { HerdSidebar } from './herd-sidebar'
import { buildHerdSnapshot } from './herd-view-model'
import { indicatorFor } from './agent-state-indicator'
import { resolveTheme } from './theme'
import { makeAgentRow, makePsResult, makeWorktreeSummary } from './herd-fixtures'

const theme = resolveTheme({})

describe('HerdSidebar', () => {
  it('renders an empty state when there are no worktrees', () => {
    const { lastFrame } = render(
      <HerdSidebar
        snapshot={buildHerdSnapshot(makePsResult([]))}
        selectedWorktreeId={null}
        theme={theme}
      />
    )
    expect(lastFrame()).toContain('No worktrees yet.')
  })

  it('renders repo groups and worktree rows with their indicators', () => {
    const snapshot = buildHerdSnapshot(
      makePsResult([
        makeWorktreeSummary({
          worktreeId: 'wt-1',
          repo: 'web-app',
          displayName: 'feature/checkout',
          status: 'working',
          agents: [makeAgentRow({ state: 'working' })]
        })
      ])
    )
    const { lastFrame } = render(
      <HerdSidebar snapshot={snapshot} selectedWorktreeId={null} theme={theme} />
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('web-app')
    expect(frame).toContain('feature/checkout')
    expect(frame).toContain(indicatorFor('working').glyph)
  })

  it('shows the blocked glyph for a worktree needing attention', () => {
    const snapshot = buildHerdSnapshot(
      makePsResult([makeWorktreeSummary({ status: 'permission' })])
    )
    const { lastFrame } = render(
      <HerdSidebar snapshot={snapshot} selectedWorktreeId={null} theme={theme} />
    )
    expect(lastFrame()).toContain(indicatorFor('blocked').glyph)
  })

  it('renders glyphs even with color disabled (NO_COLOR)', () => {
    const snapshot = buildHerdSnapshot(makePsResult([makeWorktreeSummary({ status: 'done' })]))
    const { lastFrame } = render(
      <HerdSidebar
        snapshot={snapshot}
        selectedWorktreeId={null}
        theme={resolveTheme({ NO_COLOR: '1' })}
      />
    )
    expect(lastFrame()).toContain(indicatorFor('done').glyph)
  })

  it('lets the app override the indicator kind (debounced state)', () => {
    const snapshot = buildHerdSnapshot(makePsResult([makeWorktreeSummary({ status: 'inactive' })]))
    const { lastFrame } = render(
      <HerdSidebar
        snapshot={snapshot}
        selectedWorktreeId={null}
        theme={theme}
        indicatorKindFor={() => 'working'}
      />
    )
    expect(lastFrame()).toContain(indicatorFor('working').glyph)
  })
})
