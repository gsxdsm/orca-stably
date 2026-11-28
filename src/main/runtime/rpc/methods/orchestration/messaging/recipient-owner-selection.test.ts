import { describe, expect, it } from 'vitest'
import { selectBareRecipientOwner } from './recipient-owner-selection'

const CHAT = 'orca_session_id:chat-a'

const select = (senderCoordinates: boolean) =>
  selectBareRecipientOwner({
    handle: CHAT,
    senderRunId: 'run-r',
    boundRuns: () => [],
    dispatches: () => [],
    ownerRunIds: () => ['run-r'],
    chatRecipient: true,
    senderCoordinates: () => senderCoordinates,
    fallback: () => ({ ok: true, to: CHAT, runId: 'run-r' })
  })

describe('mail to a live chat from a Run it once coordinated', () => {
  it('follows the Run when a worker there sends it', () => {
    expect(select(false)).toEqual({ ok: true, to: 'run:run-r', runId: 'run-r' })
  })

  it("leaves the Run to reach the chat when that Run's coordinator sends it", () => {
    expect(select(true)).toEqual({ ok: true, to: CHAT, runId: undefined })
  })
})
