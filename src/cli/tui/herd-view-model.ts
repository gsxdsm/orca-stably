import type {
  RuntimeWorktreeAgentRow,
  RuntimeWorktreePsResult,
  RuntimeWorktreePsSummary,
  RuntimeWorktreeStatus
} from '../../shared/runtime-types'

/** Provider-agnostic links surfaced as sidebar badges. Only one issue/PR field
 *  is typically set per worktree, but all providers are carried so the view
 *  never hard-codes GitHub. */
export type HerdBadges = {
  unread: boolean
  liveTerminalCount: number
  issue: number | null
  pr: { number: number; state: string } | null
  gitLabMr: number | null
  gitLabIssue: number | null
  linearIssue: string | null
}

export type HerdWorktreeRow = {
  worktreeId: string
  repoId: string
  displayName: string
  branch: string
  status: RuntimeWorktreeStatus
  agents: RuntimeWorktreeAgentRow[]
  isActive: boolean
  isPinned: boolean
  hasAttachedPty: boolean
  lastOutputAt: number | null
  preview: string
  parentWorktreeId: string | null
  badges: HerdBadges
}

export type HerdRepoGroup = {
  repoId: string
  repo: string
  worktrees: HerdWorktreeRow[]
}

export type HerdSnapshot = {
  groups: HerdRepoGroup[]
  totalCount: number
  truncated: boolean
}

function toRow(summary: RuntimeWorktreePsSummary): HerdWorktreeRow {
  return {
    worktreeId: summary.worktreeId,
    repoId: summary.repoId,
    displayName: summary.displayName,
    branch: summary.branch,
    status: summary.status,
    agents: summary.agents,
    isActive: summary.isActive,
    isPinned: summary.isPinned,
    hasAttachedPty: summary.hasAttachedPty,
    lastOutputAt: summary.lastOutputAt,
    preview: summary.preview,
    parentWorktreeId: summary.parentWorktreeId,
    badges: {
      unread: summary.unread,
      liveTerminalCount: summary.liveTerminalCount,
      issue: summary.linkedIssue,
      pr: summary.linkedPR,
      gitLabMr: summary.linkedGitLabMR,
      gitLabIssue: summary.linkedGitLabIssue,
      linearIssue: summary.linkedLinearIssue
    }
  }
}

/** Normalize a worktree.ps result into a stable, repo-grouped view model.
 *  Repo order follows first appearance; worktree order within a repo follows
 *  the runtime's order (newest-state-first), so the sidebar can diff stably. */
export function buildHerdSnapshot(result: RuntimeWorktreePsResult): HerdSnapshot {
  const groups: HerdRepoGroup[] = []
  const byRepoId = new Map<string, HerdRepoGroup>()

  for (const summary of result.worktrees) {
    let group = byRepoId.get(summary.repoId)
    if (!group) {
      group = { repoId: summary.repoId, repo: summary.repo, worktrees: [] }
      byRepoId.set(summary.repoId, group)
      groups.push(group)
    }
    group.worktrees.push(toRow(summary))
  }

  return { groups, totalCount: result.totalCount, truncated: result.truncated }
}

/** Flatten the grouped snapshot into a single ordered list of selectable rows,
 *  matching the top-to-bottom order the sidebar renders. */
export function flattenHerdRows(snapshot: HerdSnapshot): HerdWorktreeRow[] {
  return snapshot.groups.flatMap((group) => group.worktrees)
}
