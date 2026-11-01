import { isENOENT } from '../ipc/filesystem/filesystem-path-containment'
import type {
  AgentType,
  NativeChatMessage,
  NativeChatTurnLifecycle
} from '../../shared/native-chat-types'
import { resolveNativeChatTranscriptAgent } from '../../shared/native-chat/native-chat-agent-support'
import { readOpenCodeNativeChatTranscriptTail } from './transcript-opencode'
import { canReadHermesTranscriptHere, hermesTranscriptDeps } from './transcript-hermes'
import { resolveSessionFilePath, type ResolveSessionFileOptions } from './session-file-resolver'
import { appendNativeChatChildTranscripts } from './transcript-subagent-children'
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

/** Parent handle is closed before child files open. Nesting those reads deadlocks the scan slot. */
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
  const page = await readNativeChatTranscriptTailFile(
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
  if (endOffset !== undefined || limit <= 0) {
    return page
  }
  const messages = await appendNativeChatChildTranscripts(filePath, decode, page.messages, signal)
  return messages.length === page.messages.length ? page : { ...page, messages }
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
