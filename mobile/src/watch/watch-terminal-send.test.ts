import { describe, expect, it } from 'vitest'
import { makePaneKey } from '../../../src/shared/workspace-layout/stable-pane-id'
import { watchTerminalHandleFromSessionTabs } from './watch-terminal-send'

const LEAF = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('watchTerminalHandleFromSessionTabs', () => {
  it('sends to the ready tab handle when the worktree row has none', () => {
    const paneKey = makePaneKey('parent', LEAF)
    const handle = watchTerminalHandleFromSessionTabs(
      {
        tabs: [
          {
            type: 'terminal',
            id: 'leaf-row',
            parentTabId: 'parent',
            leafId: LEAF,
            ptyId: 'pty-1',
            terminal: 'term_ready'
          },
          {
            type: 'terminal',
            id: 'pending',
            parentTabId: 'other',
            leafId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            terminal: null
          }
        ]
      },
      paneKey
    )
    expect(handle).toBe('term_ready')
    expect(handle).not.toBe(paneKey)
  })

  it('returns null when the pane has no ready terminal tab', () => {
    expect(
      watchTerminalHandleFromSessionTabs(
        { tabs: [{ type: 'terminal', id: 'pending', terminal: null }] },
        makePaneKey('parent', LEAF)
      )
    ).toBeNull()
  })
})
