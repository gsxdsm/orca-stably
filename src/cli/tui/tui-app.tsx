import React from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import type { RunTuiOptions } from './tui-runtime-contract'

/** Root TUI component. U1 ships the shell (header, footer, clean quit); the
 *  worktree sidebar, detail pane, and actions land in later units. */
export function TuiApp({ options }: { options: RunTuiOptions }): React.JSX.Element {
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
    }
  })

  return (
    <Box flexDirection="column" width="100%">
      <Box>
        <Text bold color="cyan">
          orca tui
        </Text>
        <Text dimColor>{options.isRemote ? '  · remote runtime' : '  · local runtime'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Connecting…</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press q to quit</Text>
      </Box>
    </Box>
  )
}
