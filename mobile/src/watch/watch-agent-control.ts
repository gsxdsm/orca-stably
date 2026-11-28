import type {
  AgentSessionCancelResult,
  AgentSessionHistoryResult
} from '../../../src/shared/agent-session/agent-session-wire'
import { runningStructuredAgentSessionTurnId } from '../../../src/shared/agent-session/view/structured-agent-session-live-turn'
import { latestNativeChatOrcaStopCut } from '../../../src/shared/native-chat/transcript/continuation/native-chat-orca-stop-cut'
import { nativeChatStopSendsSecondEscape } from '../../../src/shared/native-chat/native-chat-agent-support'
import { NATIVE_CHAT_QUESTION_STEP_MS } from '../../../src/shared/native-chat/input/questions/native-chat-answer-stepping'
import { nativeChatTerminalWrite } from '../terminal/session/mobile-session-terminal-operations'
import { isRpcDeliveryUnknown } from '../transport/rpc/rpc-delivery-ambiguity'
import { isLogicalClientCutoverError } from '../transport/connection/logical-client-cutover-error'
import {
  callAgentSession,
  requestStructuredAgentSessionMutation
} from '../session/native-chat/agent-session/mobile-structured-agent-session-rpc'
import { structuredAgentSessionHostSupport } from '../session/native-chat/agent-session/mobile-structured-agent-session-host-support'
import {
  hostStatusProbe,
  readProbedHostCapabilities
} from '../transport/connection/host-status-probe-operations'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { WatchSendResult, WatchThreadTarget } from './watch-gateway'
import { resolveWatchTerminalHandle } from './watch-terminal-send'

export type WatchAgentAction = 'stop' | 'continue'

export async function controlWatchAgent(
  client: RpcClient,
  target: WatchThreadTarget,
  action: WatchAgentAction
): Promise<WatchSendResult> {
  try {
    if (target.kind === 'term' && target.workspaceId && action === 'stop') {
      const terminal = await resolveWatchTerminalHandle(client, target.workspaceId, target.id)
      if (!terminal) {
        return { outcome: 'unavailable' }
      }
      const sendEscape = async () =>
        nativeChatTerminalWrite.interpret(
          await nativeChatTerminalWrite.request(
            client,
            { terminal, text: String.fromCharCode(27) },
            {
              timeoutMs: 3_000,
              budgetSpansConnect: true,
              failWhenDisconnected: true
            }
          )
        )
      const accepted = await sendEscape()
      if (accepted && nativeChatStopSendsSecondEscape(target.agent)) {
        await new Promise<void>((resolve) => setTimeout(resolve, NATIVE_CHAT_QUESTION_STEP_MS))
        await sendEscape()
      }
      return { outcome: accepted ? 'accepted' : 'rejected' }
    }
    if (target.kind !== 'chat') {
      return { outcome: 'unavailable' }
    }
    const [history, capabilities] = await Promise.all([
      callAgentSession<AgentSessionHistoryResult>(
        client,
        'agentSession.history',
        {
          sessionId: target.id,
          direction: 'tail',
          limit: 40
        },
        5_000
      ),
      hostStatusProbe.request(client, {}, { timeoutMs: 3_000, budgetSpansConnect: true })
    ])
    const support = structuredAgentSessionHostSupport(
      readProbedHostCapabilities(capabilities) ?? []
    )
    const page = history.page
    if (!history.ok || page.sessionId !== target.id) {
      return { outcome: 'unavailable' }
    }
    if (action === 'continue') {
      const cut =
        support.continueInterrupted && latestNativeChatOrcaStopCut(page.items, page.submissions)
      if (!cut || runningStructuredAgentSessionTurnId(page)) {
        return { outcome: 'rejected' }
      }
      const result = await callAgentSession<{ outcome?: string }>(
        client,
        'agentSession.continueInterrupted',
        {
          sessionId: target.id,
          turnItemId: cut.turnItemId
        }
      )
      return { outcome: result.outcome === 'refused' ? 'rejected' : 'accepted' }
    }
    const turnId = runningStructuredAgentSessionTurnId(page)
    const fence = page.fence
    if (!fence || (!turnId && !support.conversationStop)) {
      return { outcome: 'rejected' }
    }
    const result = await requestStructuredAgentSessionMutation<AgentSessionCancelResult>({
      client,
      sessionId: target.id,
      expectedRuntimeFence: fence,
      method: 'agentSession.cancel',
      fingerprintMethod: 'agentSession.cancel',
      fields: support.conversationStop ? {} : { turnId }
    })
    return {
      outcome:
        result.status === 'accepted' || result.status === 'unknown'
          ? result.status
          : result.status === 'refused'
            ? 'rejected'
            : 'unavailable'
    }
  } catch (error) {
    return {
      outcome:
        isRpcDeliveryUnknown(error) || isLogicalClientCutoverError(error)
          ? 'unknown'
          : 'unavailable'
    }
  }
}
