import React from 'react'
import { Box, Text } from 'ink'
import {
  indicatorFor,
  worktreeIndicatorKind,
  type StatusIndicatorKind
} from './agent-state-indicator'
import { formatBadges } from './worktree-badge-format'
import type { WorktreeSnapshot, WorktreeRow } from './worktree-snapshot'
import { colorProp, type Theme } from './theme'

export type WorktreeSidebarProps = {
  snapshot: WorktreeSnapshot | null
  selectedWorktreeId: string | null
  theme: Theme
  /** Lets the app feed debounced indicator kinds; defaults to the raw kind. */
  indicatorKindFor?: (row: WorktreeRow) => StatusIndicatorKind
}

function WorktreeRow({
  row,
  selected,
  theme,
  kind
}: {
  row: WorktreeRow
  selected: boolean
  theme: Theme
  kind: StatusIndicatorKind
}): React.JSX.Element {
  const indicator = indicatorFor(kind)
  const badges = formatBadges(row.badges)
  return (
    <Box>
      <Text color={colorProp(theme, indicator.color)}>{indicator.glyph} </Text>
      <Text bold={selected} inverse={selected}>
        {row.displayName}
      </Text>
      {badges.length > 0 ? <Text dimColor> {badges}</Text> : null}
    </Box>
  )
}

export function WorktreeSidebar({
  snapshot,
  selectedWorktreeId,
  theme,
  indicatorKindFor
}: WorktreeSidebarProps): React.JSX.Element {
  const resolveKind =
    indicatorKindFor ?? ((row: WorktreeRow) => worktreeIndicatorKind(row.status, row.agents))

  if (!snapshot || snapshot.groups.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>WORKTREES</Text>
        <Text dimColor>No worktrees yet.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold>WORKTREES</Text>
      {snapshot.groups.map((group) => (
        <Box key={group.repoId} flexDirection="column" marginTop={1}>
          <Text dimColor>{group.repo}</Text>
          {group.worktrees.map((row) => (
            <WorktreeRow
              key={row.worktreeId}
              row={row}
              selected={row.worktreeId === selectedWorktreeId}
              theme={theme}
              kind={resolveKind(row)}
            />
          ))}
        </Box>
      ))}
    </Box>
  )
}
