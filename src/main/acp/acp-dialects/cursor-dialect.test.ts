import { expect, it } from 'vitest'
import { AcpTimelineTranslator } from '../timeline/acp-timeline-translator'
import { CURSOR_ACP_DIALECT } from './cursor-dialect'

// cursor-agent's ACP server sends a billing refusal as a reply chunk, then ends the prompt normally.
function endingOf(text: string) {
  const lane = new AcpTimelineTranslator({
    sessionId: 'root',
    dialect: CURSOR_ACP_DIALECT,
    agentName: 'Cursor'
  })
  lane.openPrompt('prompt-1', 1)
  const update = { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }
  const events = [
    ...lane.notification('session/update', { sessionId: 'root', update }, 2),
    ...lane.promptResult('prompt-1', { stopReason: 'end_turn' }, 3)
  ]
  const end = events.find((event) => event.type === 'turn.end')
  const status = events.flatMap((event) =>
    event.type === 'item.update' && event.body.kind === 'status' ? [event.body] : []
  )[0]
  return { outcome: end?.type === 'turn.end' ? end.outcome : undefined, status: status?.text }
}

it("fails the turn on cursor-agent's billing notices, and only on them", () => {
  expect(endingOf('\n\nUpgrade your plan to continue')).toEqual({
    outcome: 'failure',
    status: 'Upgrade your plan to continue'
  })
  expect(endingOf('\n\nAdd a payment method to continue')).toEqual({
    outcome: 'failure',
    status: 'Add a payment method to continue'
  })
  // A model reply that is just the sentence lacks the notice's leading blank line.
  expect(endingOf('Upgrade your plan to continue')).toEqual({
    outcome: 'success',
    status: undefined
  })
})
