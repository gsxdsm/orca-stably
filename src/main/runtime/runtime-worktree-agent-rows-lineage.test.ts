import { describe, expect, it } from 'vitest'
import type { RuntimeWorktreePsSummary } from '../../shared/runtime-types'
import { attachRuntimeWorktreeAgentRows } from './runtime-worktree-agent-rows'
import type { RuntimeWorktreeAgentSource } from './runtime-worktree-agent-source'

function source(
  paneKey: string,
  worktreeId: string,
  terminalHandle: string
): RuntimeWorktreeAgentSource {
  return {
    paneKey,
    worktreeId,
    terminalHandle,
    connectionId: null,
    state: 'done',
    agentType: 'hermes',
    prompt: paneKey,
    lastAssistantMessage: null,
    toolName: null,
    toolInput: null,
    interrupted: false,
    stateStartedAt: 1,
    updatedAt: 2
  }
}

function summary(worktreeId: string): RuntimeWorktreePsSummary {
  return {
    worktreeId,
    status: 'inactive',
    hasHostSidebarActivity: false,
    agents: []
  } as unknown as RuntimeWorktreePsSummary
}

describe('worktree agent rows nest orchestration workers across folder workspaces', () => {
  it('places a worker under the coordinator pane even when the stored parent pane is gone', () => {
    const coordinator = 'tab-coord:leaf-coord'
    const worker = 'tab-worker:leaf-worker'
    const summaries = new Map([
      ['folder:orca', summary('folder:orca')],
      ['folder:babysitter', summary('folder:babysitter')]
    ])
    const rowSources = new Map([
      [coordinator, source(coordinator, 'folder:orca', 'term_coord')],
      [worker, source(worker, 'folder:babysitter', 'term_worker')]
    ])
    attachRuntimeWorktreeAgentRows({
      summaries,
      rowSources,
      terminalTitleEvidenceByWorktreeId: new Map(),
      orchestrationByPaneKey: {
        [worker]: {
          parentPaneKey: 'tab-stale:leaf-stale',
          parentTerminalHandle: 'term_coord'
        }
      },
      getSummary: (id) => summaries.get(id) ?? null
    })
    const nested = summaries.get('folder:orca')?.agents ?? []
    expect(nested.map((row) => [row.paneKey, row.parentPaneKey])).toEqual([
      [coordinator, null],
      [worker, coordinator]
    ])
    expect(summaries.get('folder:orca')?.hasHostSidebarActivity).toBe(false)
    expect(summaries.get('folder:babysitter')?.agents.map((row) => row.parentPaneKey)).toEqual([
      coordinator
    ])
  })

  it('leaves a worker flat when the host has no orchestration parent', () => {
    const worker = 'tab-worker:leaf-worker'
    const summaries = new Map([['folder:babysitter', summary('folder:babysitter')]])
    attachRuntimeWorktreeAgentRows({
      summaries,
      rowSources: new Map([[worker, source(worker, 'folder:babysitter', 'term_worker')]]),
      terminalTitleEvidenceByWorktreeId: new Map(),
      orchestrationByPaneKey: {},
      getSummary: (id) => summaries.get(id) ?? null
    })
    expect(summaries.get('folder:babysitter')?.agents[0]?.parentPaneKey).toBeNull()
  })
})
