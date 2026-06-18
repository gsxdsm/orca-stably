import React from 'react'
import { Box, Text } from 'ink'
import type { TerminalTailState } from './terminal-stream'
import { paneHeights, visibleTailLines } from './pane-layout'

export type TerminalPaneData = {
  handle: string
  title: string
  tail: TerminalTailState | null
}

export type TerminalPanesProps = {
  panes: readonly TerminalPaneData[]
  focusedHandle: string | null
  /** Total rows available to the whole panes area (titles + bodies). */
  availableRows: number
  /** Width of the main panel, for full-width pane title bars. */
  availableWidth: number
}

function padBar(label: string, width: number): string {
  if (width <= 0) {
    return label
  }
  if (label.length >= width) {
    return label.slice(0, width)
  }
  return label + ' '.repeat(width - label.length)
}

function paneBody(pane: TerminalPaneData, bodyHeight: number): React.JSX.Element {
  if (pane.tail?.degraded) {
    return <Text dimColor>live output unavailable (remote terminal)</Text>
  }
  if (!pane.tail || !pane.tail.connected) {
    return <Text dimColor>loading…</Text>
  }
  const lines = visibleTailLines(pane.tail.lines, bodyHeight, 0)
  if (lines.length === 0) {
    return <Text dimColor>(no output yet)</Text>
  }
  return <Text>{lines.join('\n')}</Text>
}

/** The main terminal panel: the selected worktree's terminals rendered as a
 *  vertical stack of panes (herdr-style splits), the focused one highlighted. */
export function TerminalPanes({
  panes,
  focusedHandle,
  availableRows,
  availableWidth
}: TerminalPanesProps): React.JSX.Element {
  if (panes.length === 0) {
    return <Text dimColor>No terminals here yet. Press c to start one.</Text>
  }

  // One title row per pane; the rest is split across pane bodies.
  const bodyRows = Math.max(panes.length, availableRows - panes.length)
  const heights = paneHeights(panes.length, bodyRows)

  return (
    <Box flexDirection="column">
      {panes.map((pane, index) => {
        const focused = pane.handle === focusedHandle
        const status = pane.tail?.status === 'exited' ? ' [exited]' : ''
        const marker = focused ? '▸ ' : '  '
        return (
          <Box key={pane.handle} flexDirection="column">
            <Text
              backgroundColor={focused ? 'cyan' : undefined}
              color={focused ? 'black' : undefined}
              dimColor={!focused}
              bold={focused}
            >
              {padBar(`${marker}${pane.title}${status}`, availableWidth)}
            </Text>
            {paneBody(pane, heights[index] ?? 1)}
          </Box>
        )
      })}
    </Box>
  )
}
