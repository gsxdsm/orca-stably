import React from 'react'
import { Box, Text } from 'ink'
import type { TerminalTailState } from './terminal-stream'
import { truncateTabLabel, visibleTailLines } from './pane-layout'

export type TerminalPaneData = {
  handle: string
  title: string
  tail: TerminalTailState | null
}

export type TerminalPanesProps = {
  panes: readonly TerminalPaneData[]
  focusedHandle: string | null
  /** Rows available for the tab strip + the focused terminal body. */
  availableRows: number
}

function bodyContent(pane: TerminalPaneData | undefined, height: number): React.JSX.Element {
  if (!pane) {
    return <Text dimColor>(no terminal)</Text>
  }
  if (pane.tail?.degraded) {
    return <Text dimColor>live output unavailable (remote terminal)</Text>
  }
  if (!pane.tail || !pane.tail.connected) {
    return <Text dimColor>loading…</Text>
  }
  const lines = visibleTailLines(pane.tail.lines, height, 0)
  if (lines.length === 0) {
    return <Text dimColor>(no output yet)</Text>
  }
  return <Text>{lines.join('\n')}</Text>
}

/** Main terminal panel: a tab strip across the top (one per terminal, the
 *  focused one highlighted) and the focused terminal's output below — matching
 *  the main Orca terminal UI. */
export function TerminalPanes({
  panes,
  focusedHandle,
  availableRows
}: TerminalPanesProps): React.JSX.Element {
  if (panes.length === 0) {
    return <Text dimColor>No terminals here yet. Press c to start one.</Text>
  }

  const focused = panes.find((pane) => pane.handle === focusedHandle) ?? panes[0]
  const bodyHeight = Math.max(1, availableRows - 1)

  return (
    <Box flexDirection="column">
      <Box>
        {panes.map((pane) => {
          const isFocused = pane.handle === focused.handle
          const exited = pane.tail?.status === 'exited' ? '·' : ''
          return (
            <Text
              key={pane.handle}
              backgroundColor={isFocused ? 'cyan' : undefined}
              color={isFocused ? 'black' : undefined}
              dimColor={!isFocused}
              bold={isFocused}
            >
              {` ${truncateTabLabel(pane.title)}${exited} `}
            </Text>
          )
        })}
      </Box>
      {bodyContent(focused, bodyHeight)}
    </Box>
  )
}
