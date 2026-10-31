import { describe, expect, it } from 'vitest'
import type { RuntimeWorktreeAgentRow } from '../../../src/shared/runtime-types'
import { sidebarSessionJumps } from './sidebar-session-jumps'

function agent(
  paneKey: string,
  conversationName: string,
  parentPaneKey: string | null = null
): RuntimeWorktreeAgentRow {
  return {
    paneKey,
    parentPaneKey,
    state: 'idle',
    agentType: 'codex',
    prompt: `Prompt ${paneKey}`,
    taskTitle: null,
    displayName: null,
    conversationName,
    lastAssistantMessage: null,
    toolName: null,
    toolInput: null,
    interrupted: false,
    stateStartedAt: 1_000,
    updatedAt: 1_000
  }
}

describe('sidebarSessionJumps', () => {
  it('lists each session in sidebar order, including a nested one', () => {
    expect(
      sidebarSessionJumps(
        [agent('parent', 'Parent'), agent('child', 'Child', 'parent'), agent('other', 'Other')],
        2_000
      )
    ).toEqual([
      { paneKey: 'parent', depth: 0, label: 'Parent' },
      { paneKey: 'child', depth: 1, label: 'Child' },
      { paneKey: 'other', depth: 0, label: 'Other' }
    ])
  })

  it('offers nothing when the workspace has no sessions', () => {
    expect(sidebarSessionJumps(undefined, 2_000)).toEqual([])
    expect(sidebarSessionJumps([], 2_000)).toEqual([])
  })
})
