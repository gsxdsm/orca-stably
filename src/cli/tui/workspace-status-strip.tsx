import React from 'react'
import { Box, Text } from 'ink'
import { indicatorFor, type StatusIndicatorKind } from './agent-state-indicator'
import { windowStart } from './navigation-state'
import type { WorktreeRow } from './worktree-snapshot'
import { colorProp, type Theme } from './theme'

export type WorkspaceStatusStripProps = {
  rows: readonly WorktreeRow[]
  selectedIndex: number
  /** Visible rows; the strip scrolls to keep the selection in view. */
  height: number
  theme: Theme
  indicatorKindFor: (row: WorktreeRow) => StatusIndicatorKind
}

/** A thin vertical column of workspace status glyphs for the narrow terminal
 *  view — a compact way to see every worktree's state and click/arrow to swap
 *  which one's terminal is shown. */
export function WorkspaceStatusStrip({
  rows,
  selectedIndex,
  height,
  theme,
  indicatorKindFor
}: WorkspaceStatusStripProps): React.JSX.Element {
  const start = windowStart(selectedIndex, rows.length, height)
  const visible = rows.slice(start, start + height)
  return (
    <Box flexDirection="column">
      {visible.map((row, offset) => {
        const indicator = indicatorFor(indicatorKindFor(row))
        const isSelected = start + offset === selectedIndex
        return (
          <Text
            key={row.worktreeId}
            backgroundColor={isSelected ? 'cyan' : undefined}
            color={isSelected ? 'black' : colorProp(theme, indicator.color)}
            bold={isSelected}
          >
            {`${indicator.glyph} `}
          </Text>
        )
      })}
    </Box>
  )
}

/** First visible worktree index for the strip — shared with the mouse hit-test
 *  so a click maps to the same worktree the strip renders. */
export function stripWindowStart(selectedIndex: number, total: number, height: number): number {
  return windowStart(selectedIndex, total, height)
}
