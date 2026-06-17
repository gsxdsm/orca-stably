import React from 'react'
import { Box, Text } from 'ink'
import { keybindingHelp, type Platform } from './keybinding-map'

export type HelpOverlayProps = {
  platform?: Platform
}

export function HelpOverlay({ platform }: HelpOverlayProps): React.JSX.Element {
  const bindings = keybindingHelp(platform)
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>Keyboard shortcuts</Text>
      {bindings.map((binding) => (
        <Box key={binding.hint}>
          <Box width={12}>
            <Text bold>{binding.keys}</Text>
          </Box>
          <Text dimColor>{binding.hint}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>Mouse: click to select · scroll to move · press ? or Esc to close</Text>
      </Box>
    </Box>
  )
}
