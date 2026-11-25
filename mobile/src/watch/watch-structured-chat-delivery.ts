import type { StructuredAgentSessionState } from '../../../src/shared/agent-session/view/live-read/structured-agent-session-reducer'
import { mobileStructuredAgentSessionWorking } from '../session/native-chat/agent-session/mobile-structured-agent-session-working'
import { mobileStructuredSendQueues } from '../session/native-chat/composer/delivery/mobile-structured-send-queue-rule'

/** Same delivery choice as the phone composer. Older hosts reject `delivery` on the envelope. */
export function watchStructuredChatDelivery(
  state: StructuredAgentSessionState,
  input: { queueCapable: boolean; queueFollowUps: boolean }
): { delivery?: 'queue-if-active' } {
  return mobileStructuredSendQueues(input.queueCapable, input.queueFollowUps, state, {
    isWorking: mobileStructuredAgentSessionWorking(state),
    stopping: false
  })
    ? { delivery: 'queue-if-active' }
    : {}
}
