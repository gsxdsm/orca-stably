import React from 'react'
import { render } from 'ink-testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TuiApp } from './tui-app'
import type { RunTuiOptions } from './tui-runtime-contract'
import { makePsResult, makeWorktreeSummary } from './worktree-snapshot-fixtures'

function options(worktrees = makePsResult([])): RunTuiOptions {
  const call = vi.fn(async (method: string) => {
    if (method === 'worktree.ps') {
      return { result: worktrees }
    }
    if (method === 'terminal.list') {
      return { result: { terminals: [], totalCount: 0, truncated: false } }
    }
    return { result: {} }
  })
  return {
    client: { call, isRemote: false } as unknown as RunTuiOptions['client'],
    isRemote: false,
    noAltScreen: true
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('TuiApp', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the status bar and a connecting state on first paint', () => {
    const { lastFrame, unmount } = render(<TuiApp options={options()} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Connecting…')
    expect(frame).toContain('quit')
    unmount()
  })

  it('shows the empty state once an empty worktree snapshot arrives', async () => {
    const { lastFrame, unmount } = render(<TuiApp options={options()} />)
    await flush()
    expect(lastFrame()).toContain('No worktrees yet.')
    unmount()
  })

  it('renders worktree rows from the snapshot', async () => {
    const opts = options(
      makePsResult([makeWorktreeSummary({ displayName: 'feature/checkout', repo: 'web-app' })])
    )
    const { lastFrame, unmount } = render(<TuiApp options={opts} />)
    await flush()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('WORKTREES')
    expect(frame).toContain('feature/checkout')
    unmount()
  })
})
