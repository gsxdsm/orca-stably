import React from 'react'
import { Box, Text } from 'ink'
import type { StyledLine } from './terminal-screen'

export type TerminalScreenViewProps = {
  lines: readonly StyledLine[]
  /** Visible rows; the bottom of the screen is shown. */
  height: number
}

export function TerminalScreenView({ lines, height }: TerminalScreenViewProps): React.JSX.Element {
  const visible = lines.slice(-Math.max(1, height))
  if (visible.length === 0) {
    return <Text dimColor>(no output yet)</Text>
  }
  return (
    <Box flexDirection="column">
      {visible.map((line, lineIndex) => (
        <Text key={lineIndex} wrap="truncate-end">
          {line.length === 0
            ? ' '
            : line.map((span, spanIndex) => (
                <Text
                  key={spanIndex}
                  color={span.fg}
                  backgroundColor={span.bg}
                  bold={span.bold}
                  dimColor={span.dim}
                  italic={span.italic}
                  underline={span.underline}
                  inverse={span.inverse}
                >
                  {span.text}
                </Text>
              ))}
        </Text>
      ))}
    </Box>
  )
}
