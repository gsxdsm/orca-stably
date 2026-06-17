import React from 'react'
import { Box, Text } from 'ink'

export function ConfirmOverlay({ message }: { message: string }): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
      <Text>{message}</Text>
      <Text dimColor>
        <Text bold>y</Text> confirm · <Text bold>n</Text>/Esc cancel
      </Text>
    </Box>
  )
}

export function PromptOverlay({
  label,
  value
}: {
  label: string
  value: string
}): React.JSX.Element {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text>{label}</Text>
      <Text>
        <Text dimColor>❯ </Text>
        {value}
        <Text inverse> </Text>
      </Text>
      <Text dimColor>
        <Text bold>Enter</Text> submit · <Text bold>Esc</Text> cancel
      </Text>
    </Box>
  )
}
