import { describe, expect, it } from 'vitest'
import { EMPTY_STRUCTURED_AGENT_SESSION } from '../../../src/shared/agent-session/structured-agent-session-reducer'
import { watchStructuredChatDelivery } from './watch-structured-chat-delivery'

describe('watchStructuredChatDelivery', () => {
  it('omits delivery unless the phone composer would queue', () => {
    expect(
      watchStructuredChatDelivery(EMPTY_STRUCTURED_AGENT_SESSION, {
        queueCapable: false,
        queueFollowUps: true
      })
    ).toEqual({})
    expect(
      watchStructuredChatDelivery(EMPTY_STRUCTURED_AGENT_SESSION, {
        queueCapable: true,
        queueFollowUps: true
      })
    ).toEqual({ delivery: 'queue-if-active' })
  })
})
