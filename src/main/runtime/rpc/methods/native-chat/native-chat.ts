import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import {
  MOBILE_NATIVE_CHAT_DEFAULT_WINDOW,
  isDatabaseTranscript,
  pageForClient
} from './native-chat-rpc-client-page'
import { NATIVE_CHAT_TERMINAL_QUEUE_METHODS } from './native-chat-terminal-queue'
import { recordMobileViewOpened } from '../../../../telemetry/mobile-client-telemetry'
import type { NativeChatTranscriptFrame } from '../../../../../shared/native-chat/native-chat-transcript-frames'
import { resolveNativeChatTranscriptAgent } from '../../../../../shared/native-chat/native-chat-agent-support'
import {
  readNativeChatTranscriptTail,
  subscribeNativeChatTranscript
} from '../../../../native-chat/transcript-watch'
import type {
  NativeChatTranscriptSubscription,
  SubscribeNativeChatTranscriptArgs
} from '../../../../native-chat/transcript-watch-contract'
import { nativeChatTranscriptPathOnExecutionHost } from '../../../../native-chat/ssh-transcript-path'
import { defineMethod, defineStreamingMethod } from '../../core'
import {
  publishTranscriptTaskList,
  scanNativeChatTranscriptTasks
} from '../../../../native-chat/native-chat-transcript-task-scan'
import { sanitizeNativeChatRpcMessages } from './native-chat-rpc-block-sanitize'
import { nativeChatRpcAppendBatches } from './native-chat-rpc-page-bounds'
import {
  NativeChatSession,
  NativeChatUnsubscribe,
  type NativeChatResumePoint
} from '../../../../../shared/rpc-contract/native-chat-params'

/** Where the first page starts for a client holding `resumeAfter`; its offset and timestamp catch a rewritten file. */
function resumeIndex(
  messages: readonly NativeChatMessage[],
  resumeAfter: NativeChatResumePoint | undefined,
  agent: string
): number {
  // OpenCode rows can change after they are written, so holding the newest says nothing about the rest.
  if (!resumeAfter || resolveNativeChatTranscriptAgent(agent) === 'opencode') {
    return -1
  }
  return messages.findLastIndex(
    (message) =>
      message.id === resumeAfter.id &&
      message.transcriptOrder === resumeAfter.transcriptOrder &&
      (message.timestamp ?? null) === resumeAfter.timestamp
  )
}

export const NATIVE_CHAT_METHODS = [
  ...NATIVE_CHAT_TERMINAL_QUEUE_METHODS,
  defineMethod({
    name: 'nativeChat.readSession',
    permission: 'workspace',
    params: NativeChatSession,
    handler: async (params, { runtime, clientKind, signal }) => {
      const limit = params.limit ?? MOBILE_NATIVE_CHAT_DEFAULT_WINDOW
      const transcriptPath = nativeChatTranscriptPathOnExecutionHost(
        runtime.getAgentProviderSessionRows(),
        params.sessionId,
        params.transcriptPath
      )
      const result = await readNativeChatTranscriptTail(
        {
          agent: params.agent,
          sessionId: params.sessionId,
          transcriptPath,
          limit,
          beforeOffset: params.beforeOffset,
          sourceOrder: params.capabilities?.transcriptSourceOrder === 1,
          ...(params.subagentId ? { subagentId: params.subagentId } : {})
        },
        signal
      )
      const taskList =
        params.subagentId || params.capabilities?.taskList !== 1
          ? null
          : await scanNativeChatTranscriptTasks(
              params.agent,
              params.sessionId,
              transcriptPath
            ).catch(() => null)
      return 'messages' in result
        ? {
            ...pageForClient(
              result.messages,
              result.hasMore,
              result.beforeOffset,
              clientKind,
              limit,
              params.agent
            ),
            ...(result.lifecycle ? { lifecycle: result.lifecycle } : {}),
            ...(taskList ? { taskList } : {})
          }
        : result
    }
  }),
  defineStreamingMethod({
    name: 'nativeChat.subscribe',
    permission: 'workspace',
    params: NativeChatSession,
    handler: async (
      params,
      { runtime, connectionId, clientKind, pairedDeviceId, signal },
      emitAny
    ) => {
      const emit = (frame: NativeChatTranscriptFrame): void => emitAny(frame)
      if (signal?.aborted) {
        return
      }
      let closed = false
      let unsubscribe = (): void => {}
      const setupController = new AbortController()
      // Drain a bounded tail first, then appended turns merged by id. Use the supplied cleanup token or legacy agent:sessionId so unsubscribe matches.
      const cleanupToken = params.subscriptionId ?? `${params.agent}:${params.sessionId}`
      const subscriptionId = `nativeChat:${connectionId ?? 'local'}:${cleanupToken}`
      const limit = params.limit ?? MOBILE_NATIVE_CHAT_DEFAULT_WINDOW
      const cleanup = (): void => {
        if (closed) {
          return
        }
        closed = true
        signal?.removeEventListener('abort', handleAbort)
        setupController.abort()
        unsubscribe()
        emit({ type: 'end' })
      }
      function handleAbort(): void {
        runtime.cleanupSubscription(subscriptionId)
      }
      signal?.addEventListener('abort', handleAbort, { once: true })
      runtime.registerSubscriptionCleanup(subscriptionId, cleanup, connectionId)
      if (signal?.aborted) {
        runtime.cleanupSubscription(subscriptionId)
        return
      }
      if (closed) {
        return
      }
      const transcriptPath = nativeChatTranscriptPathOnExecutionHost(
        runtime.getAgentProviderSessionRows(),
        params.sessionId,
        params.transcriptPath
      )
      let taskScan = 0
      const publishTasks = (): void => {
        if (params.capabilities?.taskList !== 1) {
          return
        }
        const scan = ++taskScan
        publishTranscriptTaskList({
          agent: params.agent,
          sessionId: params.sessionId,
          filePath: transcriptPath,
          stillCurrent: () => !closed && scan === taskScan,
          emit: (seed) =>
            emit({
              type: 'task-list',
              taskList: seed.taskList,
              ...(seed.subagents ? { subagents: seed.subagents } : {})
            })
        })
      }
      const subscribeArgs: SubscribeNativeChatTranscriptArgs = {
        agent: params.agent,
        sessionId: params.sessionId,
        transcriptPath,
        initialLimit: limit,
        sourceOrder: params.capabilities?.transcriptSourceOrder === 1,
        onInitialSnapshot: (messages, hasMore, beforeOffset, error, lifecycle) => {
          if (closed) {
            return
          }
          const resumeAt = resumeIndex(messages, params.resumeAfter, params.agent)
          const resumed = resumeAt !== -1
          // Emit initial-read errors so a watching view cannot remain loading forever.
          emit({
            type: 'snapshot',
            ...pageForClient(
              resumed ? messages.slice(resumeAt) : messages,
              resumeAt > 0 || hasMore,
              resumed ? messages[resumeAt].transcriptOrder! : beforeOffset,
              clientKind,
              limit,
              params.agent
            ),
            ...(resumed ? { resumed } : {}),
            ...(error ? { error } : {}),
            ...(lifecycle ? { lifecycle } : {})
          })
          if (!error) {
            publishTasks()
          }
        },
        ...(params.capabilities?.transcriptPending === 1
          ? {
              onTranscriptPending: () => {
                if (!closed) {
                  emit({ type: 'snapshot', messages: [], hasMore: false, pending: true })
                }
              }
            }
          : {}),
        onReplace: (messages, hasMore, beforeOffset, lifecycle) => {
          if (closed) {
            return
          }
          emit({
            type: 'replacement',
            ...pageForClient(messages, hasMore, beforeOffset, clientKind, limit, params.agent),
            ...(lifecycle ? { lifecycle } : {})
          })
          publishTasks()
        },
        onAppend: (messages, lifecycle) => {
          if (closed) {
            return
          }
          const sanitized = sanitizeNativeChatRpcMessages(messages, clientKind)
          const batches =
            sanitized.length > 0 && isDatabaseTranscript(params.agent)
              ? nativeChatRpcAppendBatches(sanitized)
              : [sanitized]
          for (const batch of batches) {
            emit({
              type: 'appended',
              messages: batch,
              ...(lifecycle && batch === batches.at(-1) ? { lifecycle } : {})
            })
          }
        }
      }
      let subscription: NativeChatTranscriptSubscription
      try {
        subscription = await subscribeNativeChatTranscript(subscribeArgs, setupController.signal)
      } catch (error) {
        if (closed || setupController.signal.aborted) {
          return
        }
        throw error
      }
      // The connection may have closed while the file was being resolved.
      if (closed) {
        subscription.unsubscribe()
        return
      }
      if (!subscription.watching) {
        emit({
          type: 'snapshot',
          messages: [],
          hasMore: false,
          error: 'Transcript unavailable'
        })
      }
      unsubscribe = subscription.unsubscribe
      if (!subscription.watching) {
        return
      }
      recordMobileViewOpened(
        { clientKind, pairedDeviceId },
        {
          surface: 'chat',
          viewKey: `nativeChat:${params.agent}:${params.sessionId}`,
          agent: () => params.agent
        }
      )
    }
  }),
  defineMethod({
    name: 'nativeChat.unsubscribe',
    permission: 'workspace',
    params: NativeChatUnsubscribe,
    handler: async (params, { runtime, connectionId }) => {
      const connection = connectionId ?? 'local'
      if (params.subscriptionId) {
        runtime.cleanupSubscription(`nativeChat:${connection}:${params.subscriptionId}`)
        return { unsubscribed: true }
      }
      runtime.cleanupSubscriptionsByPrefix(`nativeChat:${connection}:`)
      return { unsubscribed: true }
    }
  })
]
