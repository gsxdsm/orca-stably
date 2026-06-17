import React from 'react'
import { Box, Text } from 'ink'
import {
  indicatorFor,
  worktreeIndicatorKind,
  type HerdIndicatorKind
} from './agent-state-indicator'
import { formatBadges } from './herd-badge-format'
import type { HerdSnapshot, HerdWorktreeRow } from './herd-view-model'
import { colorProp, type Theme } from './theme'

export type HerdSidebarProps = {
  snapshot: HerdSnapshot | null
  selectedWorktreeId: string | null
  theme: Theme
  /** Lets the app feed debounced indicator kinds; defaults to the raw kind. */
  indicatorKindFor?: (row: HerdWorktreeRow) => HerdIndicatorKind
}

function WorktreeRow({
  row,
  selected,
  theme,
  kind
}: {
  row: HerdWorktreeRow
  selected: boolean
  theme: Theme
  kind: HerdIndicatorKind
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

export function HerdSidebar({
  snapshot,
  selectedWorktreeId,
  theme,
  indicatorKindFor
}: HerdSidebarProps): React.JSX.Element {
  const resolveKind =
    indicatorKindFor ?? ((row: HerdWorktreeRow) => worktreeIndicatorKind(row.status, row.agents))

  if (!snapshot || snapshot.groups.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>HERD</Text>
        <Text dimColor>No worktrees yet.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold>HERD</Text>
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
