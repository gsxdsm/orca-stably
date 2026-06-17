import {
  isTextBlock,
  NATIVE_CHAT_SOURCE_PRIORITY,
  type AgentType,
  type NativeChatMessage,
  type NativeChatSession,
  type NativeChatSessionStatus
} from '../../../../shared/native-chat-types'

/** Messages grouped by source. Higher-priority sources (transcript > hook >
 *  scrape) supersede lower ones when they describe the same turn. */
export type NativeChatSources = {
  transcript?: NativeChatMessage[]
  hook?: NativeChatMessage[]
  scrape?: NativeChatMessage[]
}

export type AssembleNativeChatSessionInput = {
  sources: NativeChatSources
  sessionId: string | null
  agent: AgentType
  /** Overrides the derived status. The derived value is 'empty' when no
   *  messages survive merge, otherwise 'ready'. Callers pass 'loading',
   *  'working', or 'error' when out-of-band signals apply. */
  status?: NativeChatSessionStatus
  error?: string
}

// Why: a turn can surface from several sources with different ids (a hook event
// and the transcript record for the same assistant reply rarely share an id).
// We dedup on an explicit `turnId` when present; otherwise fall back to
// role + normalized text so the same logical turn collapses to one message.
// Normalization lowercases and collapses whitespace so cosmetic ANSI/scrape
// differences don't defeat the match.
function turnKey(message: NativeChatMessage): string {
  if (message.turnId) {
    return `turn:${message.turnId}`
  }
  const text = message.blocks
    .filter(isTextBlock)
    .map((block) => block.text)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  // Why: two same-role messages with no turnId and no text (e.g. distinct
  // tool-call-only turns) would otherwise share `${role}:` and the second would
  // be dropped. Fold a digest of the non-text blocks (tool name+input, result
  // output) into the key so different tool turns stay distinct.
  return `${message.role}:${text}:${nonTextBlockDigest(message)}`
}

function nonTextBlockDigest(message: NativeChatMessage): string {
  const parts: string[] = []
  for (const block of message.blocks) {
    if (block.type === 'tool-call') {
      parts.push(`call:${block.name}:${stableStringify(block.input)}`)
    } else if (block.type === 'tool-result') {
      parts.push(`result:${block.output}`)
    } else if (block.type === 'image-ref') {
      parts.push(`image:${block.path ?? block.url ?? block.alt ?? ''}`)
    }
  }
  return parts.join('|')
}

function stableStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function supersedes(candidate: NativeChatMessage, existing: NativeChatMessage): boolean {
  const candidateRank = NATIVE_CHAT_SOURCE_PRIORITY[candidate.source]
  const existingRank = NATIVE_CHAT_SOURCE_PRIORITY[existing.source]
  return candidateRank > existingRank
}

// Why: null timestamps (sources that can't supply one, e.g. scrape segments)
// sort before any real timestamp so they don't jump to the end. Ties break on
// id for a stable, deterministic order.
export function compareMessages(a: NativeChatMessage, b: NativeChatMessage): number {
  const at = a.timestamp ?? Number.NEGATIVE_INFINITY
  const bt = b.timestamp ?? Number.NEGATIVE_INFINITY
  if (at !== bt) {
    return at - bt
  }
  if (a.id < b.id) {
    return -1
  }
  if (a.id > b.id) {
    return 1
  }
  return 0
}

/**
 * Pure merge of layered conversation sources into a single ordered, deduped
 * `NativeChatSession`. Precedence: transcript > hook > scrape. Dedup happens on
 * message id and on turn key (explicit turnId, else role + normalized text), so
 * the same turn from multiple sources collapses to the highest-priority copy.
 */
export function assembleNativeChatSession(
  input: AssembleNativeChatSessionInput
): NativeChatSession {
  const { sources, sessionId, agent, status, error } = input

  // Process highest priority first so a later, lower-priority duplicate is
  // dropped rather than overwriting. Within a source, order is preserved.
  const ordered: NativeChatMessage[] = [
    ...(sources.transcript ?? []),
    ...(sources.hook ?? []),
    ...(sources.scrape ?? [])
  ]

  const byId = new Map<string, NativeChatMessage>()
  const byTurn = new Map<string, NativeChatMessage>()

  for (const message of ordered) {
    const existingById = byId.get(message.id)
    if (existingById) {
      if (supersedes(message, existingById)) {
        replace(byId, byTurn, existingById, message)
      }
      continue
    }
    const key = turnKey(message)
    const existingByTurn = byTurn.get(key)
    if (existingByTurn) {
      if (supersedes(message, existingByTurn)) {
        replace(byId, byTurn, existingByTurn, message)
      }
      continue
    }
    byId.set(message.id, message)
    byTurn.set(key, message)
  }

  const messages = Array.from(byId.values()).sort(compareMessages)

  const derivedStatus: NativeChatSessionStatus = messages.length === 0 ? 'empty' : 'ready'

  return {
    messages,
    status: status ?? derivedStatus,
    sessionId,
    agent,
    ...(error ? { error } : {})
  }
}

function replace(
  byId: Map<string, NativeChatMessage>,
  byTurn: Map<string, NativeChatMessage>,
  old: NativeChatMessage,
  next: NativeChatMessage
): void {
  byId.delete(old.id)
  byTurn.delete(turnKey(old))
  byId.set(next.id, next)
  byTurn.set(turnKey(next), next)
}
