// Pure decision layer for image paste. The composer persists a pasted image to
// a temp file (via the preload clipboard API) and then needs to know, per
// agent, what reference to inject into the input. Agents that accept a file
// PATH in their prompt (Claude, Codex, etc.) get the path injected; agents
// whose image handling we haven't confirmed get a clear "unsupported" result so
// the user is told rather than silently dropped.

import type { AgentType } from '../../../../shared/agent-status-types'

/** How a given agent consumes a pasted image. `path` = inject the absolute file
 *  path as text the agent reads; `unsupported` = we have no confirmed mechanism
 *  for this agent, so surface a message. New mechanisms (e.g. a base64 data ref)
 *  can be added here without touching the composer. */
export type AgentImageHandling = 'path' | 'unsupported'

// Why: these agents accept a filesystem path to an image in their prompt input
// (Claude Code and Codex both resolve a pasted/typed path to an attachment).
// Kept as an explicit allow-list so an unknown/custom agent defaults to the
// honest "unsupported" branch instead of silently injecting a path it ignores.
const PATH_IMAGE_AGENTS: ReadonlySet<AgentType> = new Set<AgentType>([
  'claude',
  'openclaude',
  'codex',
  'gemini',
  'cursor',
  'copilot',
  'droid'
])

export function getAgentImageHandling(agent: AgentType): AgentImageHandling {
  return PATH_IMAGE_AGENTS.has(agent) ? 'path' : 'unsupported'
}

export type ImagePasteResult =
  | { kind: 'inject'; reference: string }
  | { kind: 'unsupported'; agent: AgentType }

/**
 * Given the agent and the temp-file path the image was written to, decide what
 * (if anything) to inject. For path-accepting agents the reference is the bare
 * path (the composer inserts it as draft text); otherwise it's an unsupported
 * result the UI turns into a message.
 */
export function resolveImagePaste(agent: AgentType, tempFilePath: string): ImagePasteResult {
  if (getAgentImageHandling(agent) === 'path') {
    return { kind: 'inject', reference: tempFilePath }
  }
  return { kind: 'unsupported', agent }
}
