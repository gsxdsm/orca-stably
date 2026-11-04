import { isENOENT } from '../ipc/filesystem/access/filesystem-path-containment'
import type { AgentType } from '../../shared/agent-status/contracts/agent-status-types'
import type {
  NativeChatMessage,
  NativeChatTurnLifecycle
} from '../../shared/native-chat/native-chat-types'
import { resolveNativeChatTranscriptAgent } from '../../shared/native-chat/native-chat-agent-support'
import { readOpenCodeNativeChatTranscriptTail } from './transcript-opencode'
import { canReadHermesTranscriptHere, hermesTranscriptDeps } from './transcript-hermes'
import { resolveSessionFilePath, type ResolveSessionFileOptions } from './session-file-resolver'
import {
  readNativeChatSubagentPage,
  type NativeChatChildPage
} from './transcript-subagent-children'
import {
  nativeChatLineDecoderForAgent,
  readNativeChatTranscriptTailFile,
  type NativeChatLineDecoder
} from './transcript-tail-reader'
import {
  nativeChatTurnLifecycleDecoderForAgent,
  type NativeChatTurnLifecycleDecoder
} from './transcript-turn-lifecycle'
import { wslTranscriptFsRefusal } from './wsl-transcript-fs-gate'

type LiveTailPage = {
  messages: NativeChatMessage[]
  lifecycle?: NativeChatTurnLifecycle
  consumedTo: number
  hasMore: boolean
  beforeOffset: number
  latestTimestamp?: number
  malformedRecordCount?: number
  oversizedRecordCount?: number
}

export async function readNativeChatLiveTail(
  filePath: string,
  limit: number,
  decode: NativeChatLineDecoder,
  includeTrailingLine = false,
  endOffset?: number,
  decodeLifecycle?: NativeChatTurnLifecycleDecoder | null,
  signal?: AbortSignal,
  onConsumedBoundary?: (boundary: Buffer) => void,
  sourceOrder = false
): Promise<LiveTailPage> {
  return readNativeChatTranscriptTailFile(
    filePath,
    limit,
    decode,
    includeTrailingLine,
    endOffset,
    decodeLifecycle,
    signal,
    onConsumedBoundary,
    sourceOrder
  )
}

function readChildFile(
  decode: NativeChatLineDecoder,
  childPath: string,
  childLimit: number,
  endOffset: number | undefined,
  childSignal: AbortSignal | undefined
): Promise<NativeChatChildPage> {
  return readNativeChatTranscriptTailFile(
    childPath,
    childLimit,
    decode,
    true,
    endOffset,
    null,
    childSignal,
    undefined,
    true
  )
}

export async function readNativeChatTranscriptTail(
  args: ResolveSessionFileOptions & {
    agent: AgentType
    sessionId: string
    transcriptPath?: string
    filePath?: string
    limit: number
    beforeOffset?: number
    sourceOrder?: boolean
    /** One child's file. Absent reads the parent and does not embed other children. */
    subagentId?: string
  },
  signal?: AbortSignal
): Promise<
  | {
      messages: NativeChatMessage[]
      lifecycle?: NativeChatTurnLifecycle
      hasMore: boolean
      beforeOffset: number
    }
  | { error: string; notFound?: true }
> {
  if (
    args.subagentId &&
    (args.agent === 'hermes' || resolveNativeChatTranscriptAgent(args.agent) === 'opencode')
  ) {
    return { error: 'Transcript unavailable', notFound: true }
  }
  if (args.agent === 'hermes' && !canReadHermesTranscriptHere(args)) {
    return { error: 'Transcript unavailable', notFound: true }
  }
  if (args.agent === 'hermes' || resolveNativeChatTranscriptAgent(args.agent) === 'opencode') {
    return readOpenCodeNativeChatTranscriptTail(
      { ...args, agent: args.agent === 'zcode' ? 'zcode' : undefined },
      args.agent === 'hermes' ? hermesTranscriptDeps : {},
      signal
    )
  }
  const decode = nativeChatLineDecoderForAgent(args.agent)
  const decodeLifecycle = nativeChatTurnLifecycleDecoderForAgent(args.agent)
  if (!decode) {
    return { error: 'Transcript unavailable' }
  }
  let filePath: string | null
  try {
    filePath =
      args.filePath ?? (await resolveSessionFilePath(args.agent, args.sessionId, args, signal))
  } catch (error) {
    signal?.throwIfAborted()
    // Gate refusal is unavailable, never proof of a missing transcript.
    return { error: wslTranscriptFsRefusal(error).message }
  }
  signal?.throwIfAborted()
  // Session IDs can arrive before the first flush; missing paths stay retryable.
  if (!filePath) {
    return { error: 'Transcript unavailable', notFound: true }
  }
  try {
    if (args.subagentId) {
      const page = await readNativeChatSubagentPage({
        parentPath: filePath,
        decode,
        agentId: args.subagentId,
        limit: args.limit,
        beforeOffset: args.beforeOffset,
        signal,
        readTail: (childPath, childLimit, endOffset, childSignal) =>
          readChildFile(decode, childPath, childLimit, endOffset, childSignal)
      })
      return page ?? { error: 'Transcript unavailable', notFound: true }
    }
    const result = await readNativeChatLiveTail(
      filePath,
      args.limit,
      decode,
      true,
      args.beforeOffset,
      decodeLifecycle,
      signal,
      undefined,
      args.sourceOrder
    )
    signal?.throwIfAborted()
    return {
      messages: result.messages,
      // Historical pages cannot rewind live lifecycle; only the current tail describes present turn state.
      ...(args.beforeOffset === undefined && result.lifecycle
        ? { lifecycle: result.lifecycle }
        : {}),
      hasMore: result.hasMore,
      beforeOffset: result.beforeOffset
    }
  } catch (error) {
    signal?.throwIfAborted()
    const message = error instanceof Error ? error.message : String(error)
    return isENOENT(error) ? { error: message, notFound: true } : { error: message }
  }
}
