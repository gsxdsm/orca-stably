import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import type { AgentType, NativeChatBlock, NativeChatMessage } from '../../shared/native-chat-types'
import {
  asRecord,
  errorMessage,
  extractString,
  parseJsonObject,
  timestampMs
} from '../ai-vault/session-scanner-values'
import { resolveSessionFilePath, type ResolveSessionFileOptions } from './session-file-resolver'
import { claudeContentBlocks, toolResultOutput } from './transcript-record-blocks'

export type ReadTranscriptResult = { messages: NativeChatMessage[] } | { error: string }

export type ReadTranscriptOptions = ResolveSessionFileOptions & {
  /** Resolve directly to this file, skipping path discovery (used by tests). */
  filePath?: string
}

/**
 * Read the ENTIRE Claude/Codex JSONL transcript for an agent + session id into
 * the NativeChatMessage model. Unlike the AI-Vault preview scan, this applies
 * NO message cap. Unknown record types are skipped rather than throwing, so a
 * single malformed/unrecognized line cannot fail the whole read.
 */
export async function readNativeChatTranscript(
  agent: AgentType,
  sessionId: string,
  options: ReadTranscriptOptions = {}
): Promise<ReadTranscriptResult> {
  const filePath = options.filePath ?? (await resolveSessionFilePath(agent, sessionId, options))
  if (!filePath) {
    return { error: `No transcript found for ${agent} session ${sessionId}` }
  }
  try {
    if (agent === 'claude') {
      return { messages: await readClaudeTranscript(filePath) }
    }
    if (agent === 'codex') {
      return { messages: await readCodexTranscript(filePath) }
    }
    return { error: `Unsupported agent for native chat transcript: ${agent}` }
  } catch (err) {
    return { error: errorMessage(err) }
  }
}

function lineReader(filePath: string): AsyncIterable<string> {
  return createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity
  })
}

async function readClaudeTranscript(filePath: string): Promise<NativeChatMessage[]> {
  const messages: NativeChatMessage[] = []
  let index = 0

  for await (const line of lineReader(filePath)) {
    const record = parseJsonObject(line)
    if (!record) {
      continue
    }
    const role = record.type
    if (role !== 'user' && role !== 'assistant') {
      continue
    }
    const message = asRecord(record.message)
    const blocks = claudeContentBlocks(message?.content)
    if (blocks.length === 0) {
      continue
    }
    const messageId = extractString(record.uuid) ?? extractString(message?.id)
    messages.push({
      id: messageId ?? `${filePath}:${index}`,
      role: claudeMessageRole(role, blocks),
      blocks,
      timestamp: parseTimestamp(record.timestamp),
      source: 'transcript'
    })
    index++
  }

  return messages
}

// Claude marks reasoning via `thinking` content blocks; when a message is made
// up solely of reasoning, surface it as a reasoning-role message.
function claudeMessageRole(
  role: 'user' | 'assistant',
  blocks: NativeChatBlock[]
): NativeChatMessage['role'] {
  if (role === 'user') {
    const onlyToolResults = blocks.every((block) => block.type === 'tool-result')
    return onlyToolResults && blocks.length > 0 ? 'tool' : 'user'
  }
  return role
}

async function readCodexTranscript(filePath: string): Promise<NativeChatMessage[]> {
  const messages: NativeChatMessage[] = []
  let index = 0

  for await (const line of lineReader(filePath)) {
    const record = parseJsonObject(line)
    if (!record) {
      continue
    }
    const built = codexMessage(record, filePath, index)
    if (built) {
      messages.push(built)
      index++
    }
  }

  return messages
}

function codexMessage(
  record: Record<string, unknown>,
  filePath: string,
  index: number
): NativeChatMessage | null {
  const payload = asRecord(record.payload)
  if (!payload) {
    return null
  }
  const timestamp = parseTimestamp(record.timestamp)
  const baseId = extractString(payload.id) ?? `${filePath}:${index}`

  if (record.type === 'response_item') {
    return codexResponseItem(payload, baseId, timestamp)
  }
  if (record.type === 'event_msg') {
    return codexEventMessage(payload, baseId, timestamp)
  }
  return null
}

function codexResponseItem(
  payload: Record<string, unknown>,
  id: string,
  timestamp: number | null
): NativeChatMessage | null {
  if (payload.type === 'message') {
    const blocks = claudeContentBlocks(payload.content)
    if (blocks.length === 0) {
      return null
    }
    const role =
      payload.role === 'assistant' ? 'assistant' : payload.role === 'user' ? 'user' : 'system'
    return { id, role, blocks, timestamp, source: 'transcript' }
  }
  if (payload.type === 'reasoning') {
    const text = extractString(payload.text) ?? codexSummaryText(payload.summary)
    if (!text) {
      return null
    }
    return {
      id,
      role: 'reasoning',
      blocks: [{ type: 'text', text }],
      timestamp,
      source: 'transcript'
    }
  }
  if (payload.type === 'function_call' || payload.type === 'local_shell_call') {
    const name = extractString(payload.name) ?? 'tool'
    return {
      id,
      role: 'assistant',
      blocks: [{ type: 'tool-call', name, input: codexCallInput(payload) }],
      timestamp,
      source: 'transcript'
    }
  }
  if (payload.type === 'function_call_output') {
    return {
      id,
      role: 'tool',
      blocks: [codexToolResult(payload.output)],
      timestamp,
      source: 'transcript'
    }
  }
  return null
}

function codexEventMessage(
  payload: Record<string, unknown>,
  id: string,
  timestamp: number | null
): NativeChatMessage | null {
  if (payload.type === 'user_message') {
    const text = extractString(payload.message)
    return text
      ? { id, role: 'user', blocks: [{ type: 'text', text }], timestamp, source: 'transcript' }
      : null
  }
  if (payload.type === 'agent_message') {
    const text = extractString(payload.message)
    return text
      ? { id, role: 'assistant', blocks: [{ type: 'text', text }], timestamp, source: 'transcript' }
      : null
  }
  return null
}

function codexCallInput(payload: Record<string, unknown>): unknown {
  if (payload.arguments !== undefined) {
    return payload.arguments
  }
  return payload.input ?? payload.action ?? null
}

function codexToolResult(output: unknown): NativeChatBlock {
  const record = asRecord(output)
  const isError = record?.success === false || record?.is_error === true
  return {
    type: 'tool-result',
    output: toolResultOutput(record?.content ?? record?.output ?? output),
    ...(isError ? { isError: true } : {})
  }
}

function codexSummaryText(summary: unknown): string | null {
  if (!Array.isArray(summary)) {
    return null
  }
  const parts: string[] = []
  for (const item of summary) {
    const text = extractString(asRecord(item)?.text) ?? extractString(item)
    if (text) {
      parts.push(text)
    }
  }
  return parts.length ? parts.join('\n') : null
}

function parseTimestamp(value: unknown): number | null {
  const parsed = timestampMs(value)
  return Number.isFinite(parsed) ? parsed : null
}
