import { worktreeIndicatorKind, type StatusIndicatorKind } from './agent-state-indicator'
import { formatBadges } from './worktree-badge-format'
import type { WorktreeRow, WorktreeSnapshot } from './worktree-snapshot'

/** One rendered sidebar line. The component renders these top-to-bottom (one
 *  screen row each), and the app maps a mouse-click screen row back to a
 *  selectable worktree through the same list — so render and hit-testing can
 *  never drift. */
export type SidebarLine =
  | { kind: 'header' }
  | { kind: 'spacer' }
  | { kind: 'group'; repo: string }
  | {
      kind: 'row'
      /** Index into the flattened worktree-row list (selection space). */
      index: number
      worktreeId: string
      displayName: string
      badges: string
      indicator: StatusIndicatorKind
    }

export function buildSidebarLines(
  snapshot: WorktreeSnapshot | null,
  resolveKind: (row: WorktreeRow) => StatusIndicatorKind = (row) =>
    worktreeIndicatorKind(row.status, row.agents)
): SidebarLine[] {
  const lines: SidebarLine[] = [{ kind: 'header' }]
  if (!snapshot) {
    return lines
  }
  let index = 0
  for (const group of snapshot.groups) {
    lines.push({ kind: 'spacer' }, { kind: 'group', repo: group.repo })
    for (const row of group.worktrees) {
      lines.push({
        kind: 'row',
        index,
        worktreeId: row.worktreeId,
        displayName: row.displayName,
        badges: formatBadges(row.badges),
        indicator: resolveKind(row)
      })
      index += 1
    }
  }
  return lines
}

/** Map a 0-based screen row within the sidebar to a flattened worktree-row
 *  index, or null when the row is a header/group/spacer/gutter. */
export function rowIndexAtScreenRow(
  lines: readonly SidebarLine[],
  screenRow: number
): number | null {
  const line = lines[screenRow]
  return line && line.kind === 'row' ? line.index : null
}
