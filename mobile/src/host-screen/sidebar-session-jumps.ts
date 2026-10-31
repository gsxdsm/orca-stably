import type { RuntimeWorktreeAgentRow } from '../../../src/shared/runtime-types'
import { agentDisplayLabel } from '../worktree/agent-row-display'
import { flattenAgentRowLineage } from '../worktree/agent-row-lineage'

export type SidebarSessionJump = {
  paneKey: string
  depth: number
  label: string
}

/** One entry per sidebar session, in the same order the detailed list draws them. */
export function sidebarSessionJumps(
  agents: readonly RuntimeWorktreeAgentRow[] | undefined,
  now: number
): SidebarSessionJump[] {
  if (!agents || agents.length === 0) {
    return []
  }
  return flattenAgentRowLineage(agents).map((node) => ({
    paneKey: node.row.paneKey,
    depth: node.depth,
    label: agentDisplayLabel(node.row, now)
  }))
}
