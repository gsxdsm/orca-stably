import type { TerminalRef } from './tui-input'

type TerminalListEntry = { handle: string; worktreeId: string; title: string | null }

/** Group a flat terminal.list result by worktree id, so the sidebar can nest a
 *  worktree's tabs and the right pane can read the selected worktree's tabs from
 *  one poll. Titleless terminals fall back to "shell". */
export function groupTerminalsByWorktree(
  terminals: readonly TerminalListEntry[]
): Map<string, TerminalRef[]> {
  const map = new Map<string, TerminalRef[]>()
  for (const terminal of terminals) {
    const refs = map.get(terminal.worktreeId) ?? []
    refs.push({
      handle: terminal.handle,
      title: terminal.title && terminal.title.length > 0 ? terminal.title : 'shell'
    })
    map.set(terminal.worktreeId, refs)
  }
  return map
}
