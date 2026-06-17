// Built-in, best-effort slash-command catalog per agent. There is no canonical
// machine-readable command list shipped by the agent CLIs, so this is a curated
// set of the common, stable commands each TUI documents. It seeds the composer's
// slash autocomplete; the state machine treats commands as plain data, so this
// list can grow (or be replaced by a discovered list) without code changes.

import type { AgentType } from '../../../../shared/agent-status-types'
import type { SlashCommandSuggestion } from './native-chat-composer-state'

const COMMON_COMMANDS: readonly SlashCommandSuggestion[] = [
  { name: 'clear', description: 'Clear the conversation' },
  { name: 'help', description: 'Show available commands' }
]

const CLAUDE_COMMANDS: readonly SlashCommandSuggestion[] = [
  { name: 'clear', description: 'Clear conversation history' },
  { name: 'compact', description: 'Summarize and compact the conversation' },
  { name: 'init', description: 'Initialize a CLAUDE.md' },
  { name: 'review', description: 'Review the current changes' },
  { name: 'help', description: 'Show available commands' }
]

const CODEX_COMMANDS: readonly SlashCommandSuggestion[] = [
  { name: 'clear', description: 'Clear the conversation' },
  { name: 'compact', description: 'Compact the conversation' },
  { name: 'diff', description: 'Show the working diff' },
  { name: 'help', description: 'Show available commands' }
]

const COMMANDS_BY_AGENT: Partial<Record<AgentType, readonly SlashCommandSuggestion[]>> = {
  claude: CLAUDE_COMMANDS,
  openclaude: CLAUDE_COMMANDS,
  codex: CODEX_COMMANDS
}

/** Known slash commands for an agent, falling back to a small common set so the
 *  `/` menu is never empty for a recognized agent. */
export function getAgentSlashCommands(agent: AgentType): readonly SlashCommandSuggestion[] {
  return COMMANDS_BY_AGENT[agent] ?? COMMON_COMMANDS
}
