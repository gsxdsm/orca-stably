type AgentPaneOwner = {
  worktreeId: string
  agents?:
    | readonly {
        paneKey: string
        parentPaneKey?: string | null
        homeWorktreeId?: string | null
      }[]
    | null
}

/** The workspace that actually runs the pane. A mirrored copy sits on the coordinator card too. */
export function homeWorktreeForAgentPane<T extends AgentPaneOwner>(
  worktrees: readonly T[],
  paneKey: string,
  fallback: T
): T {
  const owners = worktrees.filter((worktree) =>
    worktree.agents?.some((agent) => agent.paneKey === paneKey)
  )
  if (owners.length <= 1) {
    return owners[0] ?? fallback
  }
  const row = owners
    .flatMap((worktree) => worktree.agents ?? [])
    .find((agent) => agent.paneKey === paneKey)
  if (row?.homeWorktreeId) {
    const stamped = owners.find((worktree) => worktree.worktreeId === row.homeWorktreeId)
    if (stamped) {
      return stamped
    }
  }
  const parentPaneKey = row?.parentPaneKey
  if (!parentPaneKey) {
    return fallback
  }
  return (
    owners.find((worktree) => !worktree.agents?.some((agent) => agent.paneKey === parentPaneKey)) ??
    fallback
  )
}
