import type { AgentStatus } from './agent-title-core'
import type { TerminalAgent } from './terminal-agent'

export function hermesNativeTitleStatus(
  title: string,
  agent: TerminalAgent | null
): AgentStatus | null {
  if (agent !== 'hermes') {
    return null
  }
  switch (title.match(/^(✓|⏳|⚠)\uFE0F?(?:\s|$)/u)?.[1]) {
    case '✓':
      return 'idle'
    case '⏳':
      return 'working'
    case '⚠':
      return 'permission'
    default:
      return null
  }
}
