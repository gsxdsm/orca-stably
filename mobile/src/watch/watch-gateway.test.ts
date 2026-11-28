import { describe, expect, it } from 'vitest'
import type { WatchHost } from './watch-contract'
import {
  createWatchGatewayController,
  watchSendOutcomeFromHost,
  type WatchGatewayHandlers,
  type WatchSendOutcome
} from './watch-gateway'
import type { WatchSnapshotChat, WatchSnapshotTerminal } from './watch-snapshot'

function chat(): WatchSnapshotChat {
  return {
    hostId: 'host-1',
    sessionId: 'session-1',
    workspaceId: 'wt-1',
    workspaceName: 'orca',
    agent: 'claude',
    projectedStatus: 'working',
    updatedAt: 5
  }
}

function terminal(): WatchSnapshotTerminal {
  return {
    hostId: 'host-1',
    paneKey: 'pane-1',
    terminalHandle: 'term_1',
    workspaceId: 'wt-1',
    workspaceName: 'orca',
    agent: 'codex',
    state: 'working',
    updatedAt: 4
  }
}

function harness(initialConnection: WatchHost['connection'] = 'connected') {
  let now = 10_000
  const hosts: WatchHost[] = [{ hostId: 'host-1', name: 'Studio', connection: initialConnection }]
  const chats = [chat()]
  const terminals = [terminal()]
  const pushes: unknown[] = []
  const respondIds: string[] = []
  const chatSends: string[] = []
  const terminalSends: string[] = []
  let terminalDetail = ''
  const opened: string[] = []
  let respondResult:
    | { ok: true }
    | { ok: false; reason: 'stale' | 'not_found' | 'rejected' | 'unavailable' } = { ok: true }
  let respondImpl: WatchGatewayHandlers['respond'] = async (_hostId, input) => {
    respondIds.push(input.clientOperationId)
    return respondResult
  }
  let chatOutcome: WatchSendOutcome = 'accepted'
  let terminalAccepted = true
  let scheduled: (() => void) | null = null
  const controller = createWatchGatewayController({
    now: () => now,
    hosts: () => hosts,
    sources: () => ({ chats, terminals, prompts: [], feed: [] }),
    schedule(_delay, run) {
      scheduled = run
      return () => {
        scheduled = null
      }
    },
    push(snapshot) {
      pushes.push(snapshot)
    },
    respond: (hostId, input) => respondImpl(hostId, input),
    async sendChat(_hostId, _sessionId, _text, clientOperationId) {
      chatSends.push(clientOperationId)
      return chatOutcome === 'rejected'
        ? { outcome: chatOutcome, detail: 'host refused the envelope' }
        : { outcome: chatOutcome }
    },
    async sendTerminal(_hostId, target) {
      terminalSends.push(target.paneKey)
      terminalDetail = target.workspaceId ?? ''
      return terminalAccepted
    },
    openSession(target) {
      opened.push(`${target.kind}:${target.id}:${target.workspaceId ?? ''}`)
    }
  })
  return {
    controller,
    hosts,
    chats,
    pushes,
    respondIds,
    chatSends,
    terminalSends,
    terminalTarget() {
      return terminalDetail
    },
    terminals,
    opened,
    setNow(value: number) {
      now = value
    },
    setRespond(result: typeof respondResult) {
      respondResult = result
    },
    setRespondImpl(impl: WatchGatewayHandlers['respond']) {
      respondImpl = impl
    },
    setChatOutcome(outcome: WatchSendOutcome) {
      chatOutcome = outcome
    },
    setTerminalAccepted(accepted: boolean) {
      terminalAccepted = accepted
    },
    runScheduled() {
      const run = scheduled
      scheduled = null
      run?.()
    }
  }
}

describe('watch command routing', () => {
  it('refreshes, responds, sends, and opens on the phone', async () => {
    const gate = harness()
    const refreshed = await gate.controller.handleCommand({
      v: 1,
      id: 'refresh-1',
      type: 'refresh'
    })
    expect(refreshed.ok).toBe(true)
    if (refreshed.ok) {
      expect(refreshed.snapshot?.sessions.map((session) => session.key)).toEqual([
        'host-1|chat|session-1',
        'host-1|term|pane-1'
      ])
    }

    const responded = await gate.controller.handleCommand({
      v: 1,
      id: 'respond-1',
      type: 'respond',
      hostId: 'host-1',
      promptId: 'prompt-1',
      optionId: 'yes'
    })
    expect(responded).toMatchObject({ ok: true, id: 'respond-1' })
    expect(gate.respondIds).toEqual(['respond-1'])

    const sent = await gate.controller.handleCommand({
      v: 1,
      id: 'send-1',
      type: 'send',
      sessionKey: 'host-1|chat|session-1',
      text: 'ship it'
    })
    expect(sent.ok).toBe(true)
    expect(gate.chatSends).toEqual(['send-1'])

    const written = await gate.controller.handleCommand({
      v: 1,
      id: 'send-2',
      type: 'send',
      sessionKey: 'host-1|term|pane-1',
      text: 'ls'
    })
    expect(written.ok).toBe(true)
    expect(gate.terminalSends).toEqual(['pane-1'])
    expect(gate.terminalTarget()).toBe('wt-1')

    await gate.controller.handleCommand({
      v: 1,
      id: 'open-1',
      type: 'openOnPhone',
      sessionKey: 'host-1|term|pane-1'
    })
    expect(gate.opened).toEqual(['term:pane-1:wt-1'])
  })

  it('returns a cached reply for a repeated id and runs a phone_unavailable retry again', async () => {
    const gate = harness()
    await gate.controller.handleCommand({
      v: 1,
      id: 'respond-1',
      type: 'respond',
      hostId: 'host-1',
      promptId: 'prompt-1',
      optionId: 'yes'
    })
    gate.setRespond({ ok: false, reason: 'stale' })
    const repeat = await gate.controller.handleCommand({
      v: 1,
      id: 'respond-1',
      type: 'respond',
      hostId: 'host-1',
      promptId: 'prompt-1',
      optionId: 'yes'
    })
    expect(repeat).toMatchObject({ ok: true, id: 'respond-1' })
    expect(gate.respondIds).toEqual(['respond-1'])

    gate.hosts[0] = { hostId: 'host-1', name: 'Studio', connection: 'connecting' }
    const waking = await gate.controller.handleCommand({
      v: 1,
      id: 'respond-2',
      type: 'respond',
      hostId: 'host-1',
      promptId: 'prompt-1',
      optionId: 'yes'
    })
    expect(waking).toEqual({ v: 1, id: 'respond-2', ok: false, reason: 'phone_unavailable' })
    gate.hosts[0] = { hostId: 'host-1', name: 'Studio', connection: 'connected' }
    gate.setRespond({ ok: true })
    const retried = await gate.controller.handleCommand({
      v: 1,
      id: 'respond-2',
      type: 'respond',
      hostId: 'host-1',
      promptId: 'prompt-1',
      optionId: 'yes'
    })
    expect(retried.ok).toBe(true)
    expect(gate.respondIds).toEqual(['respond-1', 'respond-2'])
  })

  it('joins an in-flight command and forgets a thrown attempt', async () => {
    const gate = harness()
    let calls = 0
    let release: (value: { ok: true }) => void = () => {}
    const pending = new Promise<{ ok: true }>((resolve) => {
      release = resolve
    })
    gate.setRespondImpl(() => {
      calls += 1
      return pending
    })
    const first = gate.controller.handleCommand({
      v: 1,
      id: 'respond-3',
      type: 'respond',
      hostId: 'host-1',
      promptId: 'prompt-1',
      optionId: 'yes'
    })
    const second = gate.controller.handleCommand({
      v: 1,
      id: 'respond-3',
      type: 'respond',
      hostId: 'host-1',
      promptId: 'prompt-1',
      optionId: 'yes'
    })
    release({ ok: true })
    expect(await first).toMatchObject({ ok: true })
    expect(await second).toMatchObject({ ok: true })
    expect(calls).toBe(1)

    gate.setRespondImpl(() => Promise.reject(new Error('socket dropped')))
    await expect(
      gate.controller.handleCommand({
        v: 1,
        id: 'respond-4',
        type: 'respond',
        hostId: 'host-1',
        promptId: 'prompt-1',
        optionId: 'yes'
      })
    ).rejects.toThrow('socket dropped')
    gate.setRespondImpl(async () => ({ ok: true }))
    expect(
      await gate.controller.handleCommand({
        v: 1,
        id: 'respond-4',
        type: 'respond',
        hostId: 'host-1',
        promptId: 'prompt-1',
        optionId: 'yes'
      })
    ).toMatchObject({ ok: true })
  })

  it('drops a cached reply after five minutes', async () => {
    const gate = harness()
    await gate.controller.handleCommand({
      v: 1,
      id: 'respond-5',
      type: 'respond',
      hostId: 'host-1',
      promptId: 'prompt-1',
      optionId: 'yes'
    })
    gate.setNow(10_000 + 5 * 60 * 1000 - 1)
    await gate.controller.handleCommand({
      v: 1,
      id: 'respond-5',
      type: 'respond',
      hostId: 'host-1',
      promptId: 'prompt-1',
      optionId: 'yes'
    })
    expect(gate.respondIds).toHaveLength(1)
    gate.setNow(10_000 + 5 * 60 * 1000)
    await gate.controller.handleCommand({
      v: 1,
      id: 'respond-5',
      type: 'respond',
      hostId: 'host-1',
      promptId: 'prompt-1',
      optionId: 'yes'
    })
    expect(gate.respondIds).toHaveLength(2)
  })

  it('rejects an unknown session and an invalid command without sending', async () => {
    const gate = harness()
    expect(
      await gate.controller.handleCommand({
        v: 1,
        id: 'missing',
        type: 'send',
        sessionKey: 'host-1|chat|missing',
        text: 'hi'
      })
    ).toEqual({ v: 1, id: 'missing', ok: false, reason: 'not_found' })
    expect(await gate.controller.handleCommand({ v: 1, id: 'bad', type: 'frob' })).toEqual({
      v: 1,
      id: 'bad',
      ok: false,
      reason: 'invalid'
    })
    expect(gate.chatSends).toEqual([])
    expect(gate.terminalSends).toEqual([])

    gate.terminals[0] = { ...gate.terminals[0], terminalHandle: undefined }
    expect(
      await gate.controller.handleCommand({
        v: 1,
        id: 'pane-only',
        type: 'send',
        sessionKey: 'host-1|term|pane-1',
        text: 'Continue'
      })
    ).toMatchObject({ ok: true })
    expect(gate.terminalSends).toEqual(['pane-1'])
    gate.setTerminalAccepted(false)
    expect(
      await gate.controller.handleCommand({
        v: 1,
        id: 'pane-miss',
        type: 'send',
        sessionKey: 'host-1|term|pane-1',
        text: 'Continue'
      })
    ).toEqual({ v: 1, id: 'pane-miss', ok: false, reason: 'unavailable' })

    gate.setChatOutcome('no-fence')
    expect(
      await gate.controller.handleCommand({
        v: 1,
        id: 'nofence',
        type: 'send',
        sessionKey: 'host-1|chat|session-1',
        text: 'Continue'
      })
    ).toEqual({ v: 1, id: 'nofence', ok: false, reason: 'unavailable' })
    gate.setChatOutcome('rejected')
    expect(
      await gate.controller.handleCommand({
        v: 1,
        id: 'refused',
        type: 'send',
        sessionKey: 'host-1|chat|session-1',
        text: 'Continue'
      })
    ).toEqual({
      v: 1,
      id: 'refused',
      ok: false,
      reason: 'rejected',
      detail: 'host refused the envelope'
    })
    gate.setChatOutcome('queued')
    expect(
      (
        await gate.controller.handleCommand({
          v: 1,
          id: 'queued',
          type: 'send',
          sessionKey: 'host-1|chat|session-1',
          text: 'Continue'
        })
      ).ok
    ).toBe(true)
    expect(watchSendOutcomeFromHost('unknown')).toBe('unavailable')
    expect(watchSendOutcomeFromHost('accepted')).toBe('accepted')
    expect(watchSendOutcomeFromHost('queued')).toBe('queued')
  })

  it('pushes immediately when needs-input changes and otherwise waits two seconds', () => {
    const gate = harness()
    gate.controller.publish()
    gate.controller.publish()
    expect(gate.pushes).toHaveLength(1)
    gate.setNow(11_000)
    gate.controller.publish()
    expect(gate.pushes).toHaveLength(1)
    gate.setNow(12_000)
    gate.runScheduled()
    expect(gate.pushes).toHaveLength(2)
    gate.chats[0] = { ...gate.chats[0], projectedStatus: 'attention' }
    gate.controller.publish()
    expect(gate.pushes).toHaveLength(3)
  })
})
