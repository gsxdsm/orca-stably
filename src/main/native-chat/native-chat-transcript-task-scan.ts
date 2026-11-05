// A chat paints a tail. The subagent pill needs the spawns that happened before that tail.

import { stat } from 'node:fs/promises'
import type { AgentType } from '../../shared/agent-status/contracts/agent-status-types'
import {
  nativeChatSubagentActivities,
  type NativeChatSubagentActivity
} from '../../shared/native-chat/input/native-chat-activity'
import { projectNativeChatTranscript } from '../../shared/native-chat/transcript/native-chat-transcript-projection'
import { readNativeChatTranscript } from './transcript-reader'
import { fillSubagentRosterActivity } from './transcript-subagent-roster-activity'

export type NativeChatTranscriptActivitySeed = {
  subagents: readonly NativeChatSubagentActivity[] | null
}

type CacheEntry = NativeChatTranscriptActivitySeed & { mtimeMs: number; size: number }

const cache = new Map<string, CacheEntry>()

function emptySeed(): NativeChatTranscriptActivitySeed {
  return { subagents: null }
}

async function seedFromFile(
  agent: AgentType,
  sessionId: string,
  filePath: string | undefined
): Promise<NativeChatTranscriptActivitySeed> {
  const read = await readNativeChatTranscript(agent, sessionId, filePath ? { filePath } : {})
  if ('error' in read) {
    return emptySeed()
  }
  const projection = projectNativeChatTranscript(read.messages)
  const roster = nativeChatSubagentActivities(projection.conversation, projection.subagentRows)
  const subagents = await fillSubagentRosterActivity(agent, filePath, roster)
  return { subagents: subagents.length > 0 ? subagents : null }
}

/** Full-file subagent roster, reused while the transcript file is unchanged. */
export async function scanNativeChatTranscriptActivity(
  agent: AgentType,
  sessionId: string,
  filePath?: string
): Promise<NativeChatTranscriptActivitySeed> {
  if (!filePath) {
    return seedFromFile(agent, sessionId, undefined)
  }
  const info = await stat(filePath).catch(() => null)
  if (!info) {
    return emptySeed()
  }
  const hit = cache.get(filePath)
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) {
    return { subagents: hit.subagents }
  }
  const seed = await seedFromFile(agent, sessionId, filePath)
  cache.set(filePath, { mtimeMs: info.mtimeMs, size: info.size, ...seed })
  return seed
}

/** Emit after the tail snapshot. An empty scan stays omitted so older clients see the same frames. */
export function publishTranscriptTaskList(args: {
  agent: AgentType
  sessionId: string
  filePath?: string
  stillCurrent: () => boolean
  emit: (seed: NativeChatTranscriptActivitySeed) => void
}): void {
  void scanNativeChatTranscriptActivity(args.agent, args.sessionId, args.filePath)
    .then((seed) => {
      if (args.stillCurrent() && seed.subagents) {
        args.emit(seed)
      }
    })
    .catch(() => undefined)
}
