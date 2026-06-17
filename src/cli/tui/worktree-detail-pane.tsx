import React from 'react'
import { Box, Text } from 'ink'
import type { HerdWorktreeRow } from './herd-view-model'
import type { TerminalTailState } from './terminal-stream'
import { TerminalTailView } from './terminal-tail-view'

export type WorktreeDetailPaneProps = {
  row: HerdWorktreeRow | null
  tail: TerminalTailState | null
  tailHeight?: number
}

function agentLine(agentType: string | null, state: string, prompt: string): string {
  const name = agentType ?? 'agent'
  const summary = prompt.length > 0 ? ` · ${prompt}` : ''
  return `${name} · ${state}${summary}`
}

export function WorktreeDetailPane({
  row,
  tail,
  tailHeight
}: WorktreeDetailPaneProps): React.JSX.Element {
  if (!row) {
    return <Text dimColor>Select a worktree to see its agents and output.</Text>
  }

  return (
    <Box flexDirection="column">
      <Text bold>{row.displayName}</Text>
      <Text dimColor>{row.branch}</Text>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>agents</Text>
        {row.agents.length === 0 ? (
          <Text dimColor>none</Text>
        ) : (
          row.agents.map((agent) => (
            <Text key={agent.paneKey}>{agentLine(agent.agentType, agent.state, agent.prompt)}</Text>
          ))
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>output</Text>
        <TerminalTailView tail={tail} height={tailHeight} />
      </Box>
    </Box>
  )
}
