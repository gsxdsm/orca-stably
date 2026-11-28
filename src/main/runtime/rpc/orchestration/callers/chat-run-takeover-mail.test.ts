import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { testOrcaSessionId } from '../../../../../shared/agent-session/identity/orca-session-address-test-fixture'
import { makeTestBot } from '../../../../bots/bot.test-fixture'
import { sessionsOf } from '../../methods/orchestration/messaging/bot-recipient.test-fixture'
import {
  ADDRESS_X,
  createSessionCallerHarness,
  orchestrationRequest,
  sessionRecord,
  SESSION_X,
  SESSION_Y,
  type SessionCallerHarness
} from './session.test-fixture'

const hostRef = vi.hoisted((): { current: unknown } => ({ current: null }))
vi.mock(
  '../../../../native-chat/agent-session-wire/host/structured-agent-session-registry',
  () => ({ getStructuredAgentSessionHost: () => hostRef.current })
)

vi.mock(
  '../../../../bots/bot-session-tabs',
  async () =>
    (await import('../../methods/orchestration/messaging/bot-recipient.test-fixture'))
      .botSessionTabsMock
)
vi.mock(
  '../../../../bots/bot-chat-session',
  async () =>
    (await import('../../methods/orchestration/messaging/bot-recipient.test-fixture'))
      .botChatSessionMock
)
vi.mock(
  '../../../../bots/bot-chat-mail-hold',
  async () =>
    (await import('../../methods/orchestration/messaging/bot-recipient.test-fixture'))
      .botChatMailHoldMock
)
vi.mock(
  '../../../../bots/bot-chat-status-line',
  async () =>
    (await import('../../methods/orchestration/messaging/bot-recipient.test-fixture'))
      .botChatStatusLineMock
)

const SENDER = testOrcaSessionId('2d9e4b71-5a3c-4f08-b6e2-8c1d7a9f0e53')

describe('mail to a chat whose Run another chat took over', () => {
  const openTabs = new Set([SESSION_X, SESSION_Y, SENDER])
  const docsSessions = sessionsOf.docs
  let h: SessionCallerHarness
  let runId: string

  beforeEach(async () => {
    h = createSessionCallerHarness(hostRef, () => ({ present: true, sessionIds: [...openTabs] }))
    h.records.set(SENDER, sessionRecord(SENDER))
    await createRun()
    runId = h.db.listRuns().runs.find((run) => run.legacy === 0)?.id ?? ''
    await useRun(runId)
  })

  afterEach(() => {
    h.close()
    openTabs.add(SESSION_X)
    sessionsOf.docs = docsSessions
    vi.restoreAllMocks()
  })

  const createRun = () =>
    h.dispatch(
      orchestrationRequest(
        'orchestration.runCreate',
        { objective: 'work' },
        { sessionId: SESSION_X }
      )
    )
  const useRun = (id: string) =>
    h.dispatch(orchestrationRequest('orchestration.runUse', { id }, { sessionId: SESSION_Y }))

  const sendToX = (from = SENDER) =>
    h.dispatch(
      orchestrationRequest(
        'orchestration.send',
        { from: `orca_session_id:${from}`, to: ADDRESS_X, subject: 'Status', body: 'Done' },
        { sessionId: from }
      )
    )

  it('reaches the chat while it is open', async () => {
    expect(await sendToX()).toMatchObject({
      ok: true,
      result: { message: { to_handle: ADDRESS_X } }
    })
  })

  it('reaches the chat when the taker hands work back', async () => {
    expect(await sendToX(SESSION_Y)).toMatchObject({
      ok: true,
      result: { message: { to_handle: ADDRESS_X } }
    })
  })

  it("reaches a bot's chat when the taker hands work back with --chat", async () => {
    sessionsOf.docs = [SESSION_X]
    vi.spyOn(h.runtime.bots, 'list').mockReturnValue([makeTestBot({ id: 'docs', name: 'Docs' })])
    vi.spyOn(h.runtime.bots, 'enabled').mockReturnValue(true)
    vi.spyOn(h.runtime, 'notifyMessageArrived').mockImplementation(() => {})

    expect(
      await h.dispatch(
        orchestrationRequest(
          'orchestration.send',
          {
            from: `orca_session_id:${SESSION_Y}`,
            to: 'bot:Docs',
            chat: SESSION_X,
            subject: 'Status',
            body: 'Done',
            type: 'question'
          },
          { sessionId: SESSION_Y }
        )
      )
    ).toMatchObject({ ok: true, result: { message: { to_handle: ADDRESS_X } } })
  })

  it('reaches the chat once the taker also takes over its next Run', async () => {
    await createRun()
    await useRun(h.db.listRuns().runs.find((run) => run.legacy === 0 && run.id !== runId)?.id ?? '')

    expect(await sendToX()).toMatchObject({
      ok: true,
      result: { message: { to_handle: ADDRESS_X } }
    })
  })

  it('follows the Run once the chat is closed', async () => {
    openTabs.delete(SESSION_X)

    expect(await sendToX()).toMatchObject({
      ok: true,
      result: { message: { to_handle: `run:${runId}` } }
    })
  })
})
