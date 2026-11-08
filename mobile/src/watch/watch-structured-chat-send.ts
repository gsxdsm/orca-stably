import { structuredAgentSessionHolderId } from '../../../src/shared/agent-session/view/structured-agent-session-holder'
import {
  EMPTY_STRUCTURED_AGENT_SESSION,
  reduceStructuredAgentSession,
  type StructuredAgentSessionState
} from '../../../src/shared/agent-session/structured-agent-session-reducer'
import { startStructuredAgentSessionLiveRead } from '../../../src/shared/agent-session/structured-agent-session-live-read'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { subscribeConnectionRevival } from '../diagnostics/connection/connection-revival-signal'
import {
  hostStatusProbe,
  readProbedHostCapabilities
} from '../transport/connection/host-status-probe-operations'
import { structuredAgentSessionHostSupport } from '../session/mobile-structured-agent-session-host-support'
import { callAgentSession } from '../session/mobile-structured-agent-session-rpc'
import { sendMobileStructuredAgentSessionMessage } from '../session/mobile-structured-agent-session-send'
import {
  mobileNativeChatHostPreference,
  QUEUE_FOLLOW_UPS_PREFERENCE
} from '../session/mobile-native-chat-host-preference'
import { subscribeTranscriptAfterHold } from '../session/mobile-structured-transcript-subscription'
import { structuredSessionOperationId } from '../session/structured-session-operation-id'
import { watchStructuredChatDelivery } from './watch-structured-chat-delivery'
import { watchSendOutcomeFromHost, type WatchSendOutcome } from './watch-gateway'

const JOURNAL_WAIT_MS = 2_500

export type WatchChatSendResult = {
  outcome: WatchSendOutcome
  detail?: string
}

function watchReplyDetail(text: string | undefined): string | undefined {
  const trimmed = text?.replace(/\s+/g, ' ').trim()
  if (!trimmed) {
    return undefined
  }
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed
}

async function readHostCapabilities(client: RpcClient): Promise<readonly string[]> {
  try {
    return readProbedHostCapabilities(await hostStatusProbe.request(client)) ?? []
  } catch {
    return []
  }
}

/** Hold, then reduce the live journal the way the phone chat screen does. */
async function readWatchStructuredChatState(
  client: RpcClient,
  sessionId: string,
  held: Promise<unknown>
): Promise<StructuredAgentSessionState | null> {
  let state = EMPTY_STRUCTURED_AGENT_SESSION
  let settled = false
  let resolveReady: (value: StructuredAgentSessionState | null) => void = () => {}
  const ready = new Promise<StructuredAgentSessionState | null>((resolve) => {
    resolveReady = resolve
  })
  const finish = (value: StructuredAgentSessionState | null) => {
    if (settled) {
      return
    }
    settled = true
    clearTimeout(timer)
    resolveReady(value)
  }
  const timer = setTimeout(() => finish(positiveFence(state.fence) ? state : null), JOURNAL_WAIT_MS)
  const read = startStructuredAgentSessionLiveRead({
    applyRequests: (action) => {
      state = reduceStructuredAgentSession(state, action, Date.now())
    },
    applyEvent: (event, options) => {
      state = reduceStructuredAgentSession(state, { type: 'event', event, ...options }, Date.now())
      if (positiveFence(state.fence)) {
        finish(state)
      }
    },
    applyError: () => {},
    getCursor: () => state.cursor,
    onContactLost: () => {},
    onHistoryReadInvalidated: () => {},
    readCurrentRequests: (request) =>
      callAgentSession(client, 'agentSession.currentRequests', request),
    sessionId,
    subscribe: subscribeTranscriptAfterHold(client, held, () => settled),
    subscribeRetryNow: subscribeConnectionRevival
  })
  try {
    return await ready
  } finally {
    read.dispose()
  }
}

function positiveFence(fence: number | null): fence is number {
  return typeof fence === 'number' && Number.isInteger(fence) && fence > 0
}

export async function sendWatchStructuredChat(input: {
  client: RpcClient
  sessionId: string
  text: string
}): Promise<WatchChatSendResult> {
  const holderId = structuredAgentSessionHolderId('mobile-chat')
  const held = callAgentSession(input.client, 'agentSession.hold', {
    sessionId: input.sessionId,
    holderId
  }).catch(() => undefined)
  try {
    const state = await readWatchStructuredChatState(input.client, input.sessionId, held)
    if (!state || !positiveFence(state.fence)) {
      return { outcome: 'no-fence' }
    }
    const capabilities = await readHostCapabilities(input.client)
    const queueCapable = structuredAgentSessionHostSupport(capabilities).queuedMessages === true
    const queueFollowUps = mobileNativeChatHostPreference(
      input.client,
      QUEUE_FOLLOW_UPS_PREFERENCE
    ).getSnapshot()
    let detail: string | undefined
    const outcome = await sendMobileStructuredAgentSessionMessage({
      client: input.client,
      sessionId: input.sessionId,
      expectedRuntimeFence: state.fence,
      text: input.text,
      attachments: [],
      ...watchStructuredChatDelivery(state, { queueCapable, queueFollowUps }),
      clientMessageId: structuredSessionOperationId(),
      onError: (message) => {
        detail = message
      }
    })
    const replyDetail = watchReplyDetail(detail)
    return {
      outcome: watchSendOutcomeFromHost(outcome),
      ...(replyDetail ? { detail: replyDetail } : {})
    }
  } catch (error) {
    const detail = watchReplyDetail(error instanceof Error ? error.message : undefined)
    return { outcome: 'unavailable', ...(detail ? { detail } : {}) }
  } finally {
    void held.then(() =>
      callAgentSession(
        input.client,
        'agentSession.release',
        { sessionId: input.sessionId, holderId },
        undefined,
        { failWhenDisconnected: true }
      ).catch(() => undefined)
    )
  }
}
