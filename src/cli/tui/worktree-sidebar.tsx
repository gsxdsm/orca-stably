import React from 'react'
import { Box, Text } from 'ink'
import { indicatorFor, type StatusIndicatorKind } from './agent-state-indicator'
import type { WorktreeRow, WorktreeSnapshot } from './worktree-snapshot'
import { buildSidebarLines, type SidebarLine } from './sidebar-lines'
import { colorProp, type Theme } from './theme'

export type WorktreeSidebarProps = {
  snapshot: WorktreeSnapshot | null
  selectedWorktreeId: string | null
  theme: Theme
  /** Lets the app feed debounced indicator kinds; defaults to the raw kind. */
  indicatorKindFor?: (row: WorktreeRow) => StatusIndicatorKind
}

function RowLine({
  line,
  selected,
  theme
}: {
  line: Extract<SidebarLine, { kind: 'row' }>
  selected: boolean
  theme: Theme
}): React.JSX.Element {
  const indicator = indicatorFor(line.indicator)
  return (
    <Box>
      <Text color={colorProp(theme, indicator.color)}>{indicator.glyph} </Text>
      <Text bold={selected} inverse={selected}>
        {line.displayName}
      </Text>
      {line.badges.length > 0 ? <Text dimColor> {line.badges}</Text> : null}
    </Box>
  )
}

export function WorktreeSidebar({
  snapshot,
  selectedWorktreeId,
  theme,
  indicatorKindFor
}: WorktreeSidebarProps): React.JSX.Element {
  const lines = buildSidebarLines(snapshot ?? null, indicatorKindFor)
  const hasRows = lines.some((line) => line.kind === 'row')

  return (
    <Box flexDirection="column">
      {lines.map((line, screenRow) => {
        if (line.kind === 'header') {
          return (
            <Text key="header" bold>
              WORKTREES
            </Text>
          )
        }
        if (line.kind === 'spacer') {
          return <Text key={`spacer-${screenRow}`}> </Text>
        }
        if (line.kind === 'group') {
          return (
            <Text key={`group-${screenRow}`} dimColor>
              {line.repo}
            </Text>
          )
        }
        return (
          <RowLine
            key={line.worktreeId}
            line={line}
            selected={line.worktreeId === selectedWorktreeId}
            theme={theme}
          />
        )
      })}
      {hasRows ? null : <Text dimColor>No worktrees yet.</Text>}
    </Box>
  )
}
