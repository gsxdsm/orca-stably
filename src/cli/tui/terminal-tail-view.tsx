import React from 'react'
import { Box, Text } from 'ink'
import type { TerminalTailState } from './terminal-stream'

export type TerminalTailViewProps = {
  tail: TerminalTailState | null
  /** How many trailing lines to show (the pane height budget). */
  height?: number
}

export function TerminalTailView({ tail, height = 12 }: TerminalTailViewProps): React.JSX.Element {
  if (!tail) {
    return <Text dimColor>No terminal selected.</Text>
  }
  if (tail.degraded) {
    // Remote PTY with no main-owned snapshot — don't fake output.
    return <Text dimColor>Live output is unavailable for this remote terminal.</Text>
  }

  const visible = tail.lines.slice(-height)
  return (
    <Box flexDirection="column">
      {tail.truncated ? <Text dimColor>… earlier output truncated</Text> : null}
      {visible.length === 0 ? (
        <Text dimColor>(no output yet)</Text>
      ) : (
        <Text>{visible.join('\n')}</Text>
      )}
      {tail.status === 'exited' ? <Text dimColor>[process exited]</Text> : null}
      {!tail.connected ? <Text dimColor>[reconnecting…]</Text> : null}
    </Box>
  )
}
