// A session-list child tap names the subagent before navigation; the chat reads it once.
let pending: { worktreeId: string; childId: string } | null = null

export function setPendingSubagentFocus(worktreeId: string, childId: string): void {
  pending = { worktreeId, childId }
}

export function takePendingSubagentFocus(worktreeId: string | undefined): string | null {
  if (!worktreeId || pending?.worktreeId !== worktreeId) {
    return null
  }
  const childId = pending.childId
  pending = null
  return childId
}
