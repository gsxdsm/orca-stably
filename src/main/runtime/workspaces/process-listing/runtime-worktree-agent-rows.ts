import {
  isFreshNonDoneAgentStatus,
  isAgentStatusFresh
} from '../../../../shared/agent-status/contracts/agent-status-freshness'

import type {
  RuntimeWorktreeAgentRow,
  RuntimeWorktreePsSummary
} from '../../../../shared/runtime-worktree-contracts'
import type {
  AgentListPublication,
  AgentListVerdict
} from '../../../../shared/agent-status/presentation/agent-list-status'
import { mergeWorktreeSummaryStatus } from './runtime-worktree-status-projection'
import {
  resolveRuntimeWorktreeSidebarStatus,
  terminalTitleEvidenceMatchesSource
} from './runtime-worktree-sidebar-status'
import {
  connectionEvidenceHostId,
  type RuntimeWorktreePsSummaryLookup
} from './runtime-worktree-summary-paths'
import type { RuntimeTerminalTitleEvidence } from './runtime-worktree-ps-activity'
import type { RuntimeWorktreeAgentSource } from './runtime-worktree-agent-source'

type OrchestrationDisplay = {
  taskTitle?: string | null
  displayName?: string | null
  parentPaneKey?: string | null
  parentTerminalHandle?: string | null
  coordinatorHandle?: string | null
}

function sourceForHandle(
  rowSources: ReadonlyMap<string, RuntimeWorktreeAgentSource>,
  handle: string | null | undefined
): RuntimeWorktreeAgentSource | undefined {
  if (!handle) {
    return undefined
  }
  for (const source of rowSources.values()) {
    if (source.terminalHandle === handle) {
      return source
    }
  }
  return undefined
}

/** The visible parent row. A stored pane that no longer matches a listed session falls back to the live terminal. */
function visibleParentPaneKey(
  source: RuntimeWorktreeAgentSource,
  orchestration: OrchestrationDisplay | undefined,
  rowSources: ReadonlyMap<string, RuntimeWorktreeAgentSource>
): string | null {
  const explicit = orchestration?.parentPaneKey
  if (explicit && explicit !== source.paneKey && rowSources.has(explicit)) {
    return explicit
  }
  const byHandle =
    sourceForHandle(rowSources, orchestration?.parentTerminalHandle) ??
    sourceForHandle(rowSources, orchestration?.coordinatorHandle)
  if (byHandle && byHandle.paneKey !== source.paneKey) {
    return byHandle.paneKey
  }
  return null
}

function summaryForSource(
  source: RuntimeWorktreeAgentSource | undefined,
  getSummary: RuntimeWorktreePsSummaryLookup
): RuntimeWorktreePsSummary | null {
  return source?.worktreeId
    ? getSummary(source.worktreeId, connectionEvidenceHostId(source.connectionId))
    : null
}

/** A mirrored child keeps another workspace's summary. A path alias of this summary still owns it. */
function rowBelongsToSummary(
  source: RuntimeWorktreeAgentSource | undefined,
  summary: RuntimeWorktreePsSummary,
  getSummary: RuntimeWorktreePsSummaryLookup
): boolean {
  return summaryForSource(source, getSummary) === summary
}

function mirrorCrossWorkspaceChildren(
  rowsBySummary: Map<RuntimeWorktreePsSummary, RuntimeWorktreeAgentRow[]>,
  rowSources: ReadonlyMap<string, RuntimeWorktreeAgentSource>,
  summaries: Map<string, RuntimeWorktreePsSummary>,
  getSummary: RuntimeWorktreePsSummaryLookup
): void {
  const knownSummaries = new Set(summaries.values())
  const mirrors: [RuntimeWorktreePsSummary, RuntimeWorktreeAgentRow][] = []
  const rowsByPaneKey = new Map<string, RuntimeWorktreeAgentRow>()
  for (const rows of rowsBySummary.values()) {
    for (const row of rows) {
      rowsByPaneKey.set(row.paneKey, row)
    }
  }
  for (const [summary, rows] of rowsBySummary) {
    for (const row of rows) {
      const visited = new Set<string>()
      let ancestorPaneKey = row.parentPaneKey ?? null
      while (ancestorPaneKey && !visited.has(ancestorPaneKey)) {
        visited.add(ancestorPaneKey)
        const ancestorSummary = summaryForSource(rowSources.get(ancestorPaneKey), getSummary)
        if (ancestorSummary && ancestorSummary !== summary && knownSummaries.has(ancestorSummary)) {
          mirrors.push([ancestorSummary, row])
        }
        ancestorPaneKey = rowsByPaneKey.get(ancestorPaneKey)?.parentPaneKey ?? null
      }
    }
  }
  for (const [parentSummary, row] of mirrors) {
    const parentRows = rowsBySummary.get(parentSummary) ?? []
    if (parentRows.some((existing) => existing.paneKey === row.paneKey)) {
      continue
    }
    parentRows.push(row)
    rowsBySummary.set(parentSummary, parentRows)
  }
}

const UNLISTED: AgentListVerdict = { listed: false }

/** A pane the window gave no verdict is not in its list, unless it changed after the window last looked. */
function agentListVerdict(
  agentList: AgentListPublication,
  source: RuntimeWorktreeAgentSource
): AgentListVerdict | undefined {
  return (
    agentList.verdicts[source.paneKey] ??
    (source.updatedAt > agentList.publishedAt ? undefined : UNLISTED)
  )
}

export function attachRuntimeWorktreeAgentRows(args: {
  summaries: Map<string, RuntimeWorktreePsSummary>
  rowSources: ReadonlyMap<string, RuntimeWorktreeAgentSource>
  terminalTitleEvidenceByRow: ReadonlyMap<
    RuntimeWorktreePsSummary,
    readonly RuntimeTerminalTitleEvidence[]
  >
  orchestrationByPaneKey: Record<string, OrchestrationDisplay> | null | undefined
  getSummary: RuntimeWorktreePsSummaryLookup
  conversationName?: (source: RuntimeWorktreeAgentSource) => string | null
  /** The desktop window's Agents-list verdicts; null when no window has published them. */
  agentList?: AgentListPublication | null
}): void {
  const { rowSources } = args
  const now = Date.now()
  const rowsBySummary = new Map<RuntimeWorktreePsSummary, RuntimeWorktreeAgentRow[]>()
  for (const source of rowSources.values()) {
    const { worktreeId } = source
    if (!worktreeId) {
      continue
    }
    const summary = args.getSummary(worktreeId, connectionEvidenceHostId(source.connectionId))
    if (!summary) {
      continue
    }
    const orchestration = args.orchestrationByPaneKey?.[source.paneKey]
    const parentPaneKey = visibleParentPaneKey(source, orchestration, rowSources)
    // Like desktop lineage, a listed child running in its parent's tab does not own that tab's name.
    const parent = parentPaneKey ? rowSources.get(parentPaneKey) : undefined
    const conversationName =
      parent && parent.tabId === source.tabId ? null : args.conversationName?.(source)
    const row: RuntimeWorktreeAgentRow = {
      paneKey: source.paneKey,
      ...(source.terminalHandle ? { terminalHandle: source.terminalHandle } : {}),
      parentPaneKey,
      homeWorktreeId: summary.worktreeId,
      ...(summary.hostId ? { homeHostId: summary.hostId } : {}),
      state: source.state,
      ...(source.workingMode ? { workingMode: source.workingMode } : {}),
      agentType: source.agentType,
      prompt: source.prompt,
      taskTitle: orchestration?.taskTitle ?? null,
      displayName: orchestration?.displayName ?? null,
      ...(conversationName ? { conversationName } : {}),
      lastAssistantMessage: source.lastAssistantMessage,
      toolName: source.toolName,
      toolInput: source.toolInput,
      interrupted: source.interrupted,
      ...(source.mainAgent ? { mainAgent: source.mainAgent } : {}),
      stateStartedAt: source.stateStartedAt,
      updatedAt: source.updatedAt,
      ...(source.children !== undefined ? { children: source.children } : {}),
      ...(source.subagents !== undefined ? { subagents: source.subagents } : {}),
      ...(source.structuredHost === 'owned' ? { structuredHostOwned: true as const } : {}),
      ...(source.hasLivePty ? { hasLivePty: true as const } : {}),
      ...(source.programStatus ? { programStatus: source.programStatus } : {})
    }
    if (source.children !== undefined || source.subagents !== undefined) {
      row.subagentObservation = isAgentStatusFresh(row, now) ? 'live' : 'unverifiable'
    }
    const activity = args.agentList && agentListVerdict(args.agentList, source)
    if (activity) {
      row.activity = activity
    }
    const rows = rowsBySummary.get(summary)
    if (rows) {
      rows.push(row)
    } else {
      rowsBySummary.set(summary, [row])
    }
  }
  mirrorCrossWorkspaceChildren(rowsBySummary, rowSources, args.summaries, args.getSummary)
  for (const [summary, rows] of rowsBySummary) {
    rows.sort((a, b) => a.stateStartedAt - b.stateStartedAt)
    summary.agents = rows
    let hasForegroundWorkingAgent = false
    const monitoringSources: RuntimeWorktreeAgentSource[] = []
    for (const row of rows) {
      // A child mirrored onto its coordinator's workspace must not mark that workspace busy.
      if (!rowBelongsToSummary(rowSources.get(row.paneKey), summary, args.getSummary)) {
        continue
      }
      if (!isFreshNonDoneAgentStatus(row, now)) {
        continue
      }
      summary.hasHostSidebarActivity = true
      if (row.state === 'working') {
        if (row.workingMode === 'monitoring') {
          const source = rowSources.get(row.paneKey)
          if (source) {
            monitoringSources.push(source)
          }
        } else {
          hasForegroundWorkingAgent = true
        }
      } else {
        mergeWorktreeSummaryStatus(summary, 'permission')
      }
    }
    if (hasForegroundWorkingAgent || monitoringSources.length > 0) {
      const hasIndependentWorkingTerminal = (
        args.terminalTitleEvidenceByRow.get(summary) ?? []
      ).some(
        (evidence) =>
          evidence.status === 'working' &&
          monitoringSources.every((source) => !terminalTitleEvidenceMatchesSource(evidence, source))
      )
      mergeWorktreeSummaryStatus(
        summary,
        'working',
        hasForegroundWorkingAgent || hasIndependentWorkingTerminal ? undefined : 'monitoring'
      )
    }
  }
  for (const summary of args.summaries.values()) {
    summary.sidebarStatus = resolveRuntimeWorktreeSidebarStatus(
      summary,
      now,
      args.terminalTitleEvidenceByRow.get(summary) ?? [],
      (paneKey) => rowSources.get(paneKey),
      (paneKey) => rowBelongsToSummary(rowSources.get(paneKey), summary, args.getSummary)
    )
  }
}
