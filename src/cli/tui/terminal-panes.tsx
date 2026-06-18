import React from 'react'
import { Box, Text } from 'ink'
import { TerminalScreenView } from './terminal-screen-view'
import type { TerminalScreenState } from './terminal-screen'
import { truncateTabLabel } from './pane-layout'

export type TerminalTab = { handle: string; title: string }

export type TerminalPanesProps = {
  tabs: readonly TerminalTab[]
  focusedHandle: string | null
  screen: TerminalScreenState | null
  /** Rows available for the tab strip + the focused terminal body. */
  availableRows: number
}

function body(screen: TerminalScreenState | null, height: number): React.JSX.Element {
  if (!screen || !screen.connected) {
    return <Text dimColor>loading…</Text>
  }
  if (screen.lines.length === 0) {
    return <Text dimColor>(no output yet)</Text>
  }
  return <TerminalScreenView lines={screen.lines} height={height} />
}

/** Main terminal panel: a tab strip across the top (one per terminal, focused
 *  highlighted) and the focused terminal's live, colored output below. */
export function TerminalPanes({
  tabs,
  focusedHandle,
  screen,
  availableRows
}: TerminalPanesProps): React.JSX.Element {
  if (tabs.length === 0) {
    return <Text dimColor>No terminals here yet. Press c to start one.</Text>
  }

  const focused = focusedHandle ?? tabs[0].handle

  return (
    <Box flexDirection="column">
      <Box>
        {tabs.map((tab) => {
          const isFocused = tab.handle === focused
          return (
            <Text
              key={tab.handle}
              backgroundColor={isFocused ? 'cyan' : undefined}
              color={isFocused ? 'black' : undefined}
              dimColor={!isFocused}
              bold={isFocused}
            >
              {` ${truncateTabLabel(tab.title)} `}
            </Text>
          )
        })}
      </Box>
      {body(screen, Math.max(1, availableRows - 1))}
    </Box>
  )
}
