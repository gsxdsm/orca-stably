import React from 'react'
import { Box, Text } from 'ink'
import { statusBarHelp, type Platform } from './keybinding-map'

export type StatusBarProps = {
  platform?: Platform
  /** Shown prominently when the snapshot source is disconnected. */
  disconnected?: boolean
  /** Transient error from the last action, surfaced inline. */
  error?: string | null
  /** Context (repo · branch) shown at the left of the footer, herdr-style. */
  context?: string
}

export function StatusBar({
  platform,
  disconnected,
  error,
  context
}: StatusBarProps): React.JSX.Element {
  const hints = statusBarHelp(platform)
  return (
    <Box flexDirection="column">
      {disconnected ? <Text color="yellow">runtime disconnected — reconnecting…</Text> : null}
      {error ? <Text color="red">{error}</Text> : null}
      <Box>
        {context ? <Text color="cyan">{context} </Text> : null}
        {hints.map((hint, index) => (
          <Text key={hint.hint} dimColor>
            {index > 0 ? '  ' : ''}
            <Text bold>{hint.keys}</Text> {hint.hint}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
