import { describe, expect, it, vi } from 'vitest'
import type { MobilePushPrompt } from '../../../shared/mobile-push-contract'
import type { PushGatewayClient } from './push-gateway-client'
import { PushDispatcher } from './push-dispatcher'
import { mapPushAgentState } from '../../../shared/mobile-push-alert'
import {
  createHarness,
  flush,
  notification,
  registration,
  type SendCall
} from './push-dispatcher.test-fixture'

describe('PushDispatcher', () => {
  it('batches every matching registration into one send', async () => {
    const harness = createHarness({
      devices: [
        { deviceId: 'a', pushRegistration: registration({ registrationId: 'reg-a' }) },
        { deviceId: 'b', pushRegistration: registration({ registrationId: 'reg-b' }) },
        { deviceId: 'c' }
      ]
    })

    harness.dispatcher.enqueue(notification())
    await flush()

    expect(harness.sends).toHaveLength(1)
    expect(harness.sends[0]?.registrationIds).toEqual(['reg-a', 'reg-b'])
    expect(harness.sends[0]?.notification).toMatchObject({
      source: 'agent-task-complete',
      agentState: 'finished',
      notificationSeq: 7,
      notificationEpoch: 'epoch-1',
      worktreeId: 'repo::wt1'
    })
  })

  it('fans out past the per-request cap instead of starving the extra devices', async () => {
    const devices = Array.from({ length: 25 }, (_, index) => ({
      deviceId: `device-${index}`,
      pushRegistration: registration({ registrationId: `reg-${index}` })
    }))
    const harness = createHarness({ devices })

    harness.dispatcher.enqueue(notification())
    await flush()

    expect(harness.sends).toHaveLength(2)
    expect(harness.sends[0]?.registrationIds).toHaveLength(20)
    expect(harness.sends[1]?.registrationIds).toEqual([
      'reg-20',
      'reg-21',
      'reg-22',
      'reg-23',
      'reg-24'
    ])
  })

  it('drops a dead registration reported by a later chunk', async () => {
    const devices = Array.from({ length: 25 }, (_, index) => ({
      deviceId: `device-${index}`,
      pushRegistration: registration({ registrationId: `reg-${index}` })
    }))
    const harness = createHarness({
      devices,
      results: [{ registrationId: 'reg-24', status: 'dead' }]
    })

    harness.dispatcher.enqueue(notification())
    await flush()

    expect(harness.cleared).toEqual(['device-24'])
  })

  it('pushes a silent dismissal with an absolute expiry', async () => {
    const harness = createHarness({
      devices: [{ deviceId: 'a', pushRegistration: registration() }]
    })

    harness.dispatcher.enqueue({
      type: 'dismiss',
      notificationId: 'agent:one',
      notificationSeq: 8,
      notificationEpoch: 'epoch-1'
    })
    await flush()

    expect(harness.sends).toHaveLength(1)
    expect(harness.sends[0]?.notification).toMatchObject({
      kind: 'dismiss',
      sound: false,
      notificationId: 'agent:one',
      expiresAt: expect.any(Number)
    })
  })

  it('stays silent while the agent is still working', async () => {
    const harness = createHarness({
      devices: [{ deviceId: 'a', pushRegistration: registration() }]
    })

    harness.dispatcher.enqueue(notification({ agentState: 'working' }))
    await flush()

    expect(harness.sends).toHaveLength(0)
  })

  it('drops a registration the gateway reports dead', async () => {
    const harness = createHarness({
      devices: [
        { deviceId: 'a', pushRegistration: registration({ registrationId: 'reg-a' }) },
        { deviceId: 'b', pushRegistration: registration({ registrationId: 'reg-b' }) }
      ],
      results: [
        { registrationId: 'reg-a', status: 'dead' },
        { registrationId: 'reg-b', status: 'queued' }
      ]
    })

    harness.dispatcher.enqueue(notification())
    await flush()

    expect(harness.cleared).toEqual(['a'])
  })

  it('retries once when the gateway is unreachable', async () => {
    const sends: SendCall[] = []
    const client = {
      send: vi.fn(async (input: SendCall) => {
        sends.push(input)
        return { ok: false as const, reason: 'unreachable' as const }
      })
    } as unknown as PushGatewayClient
    const scheduled: (() => void)[] = []
    const devices = [{ deviceId: 'a', pushRegistration: registration() }]
    const dispatcher = new PushDispatcher({
      client,
      registry: {
        listDevices: () => devices,
        setPushRegistration: () => true
      },
      scheduleRetry: (run, delayMs) => {
        expect(delayMs).toBe(2_000)
        scheduled.push(run)
      }
    })

    dispatcher.enqueue(notification())
    await flush()
    expect(sends).toHaveLength(1)
    expect(scheduled).toHaveLength(1)

    scheduled[0]?.()
    await flush()
    expect(sends).toHaveLength(2)
    expect(scheduled).toHaveLength(1)
  })

  it('never throws into the caller when the client rejects', async () => {
    const harness = createHarness({
      devices: [{ deviceId: 'a', pushRegistration: registration() }],
      sendImpl: async () => {
        throw new Error('boom')
      }
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => harness.dispatcher.enqueue(notification())).not.toThrow()
    await flush()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('never throws when the registry itself fails', async () => {
    const dispatcher = new PushDispatcher({
      client: { send: vi.fn() } as unknown as PushGatewayClient,
      registry: {
        listDevices: () => {
          throw new Error('registry unavailable')
        },
        setPushRegistration: () => true
      }
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => dispatcher.enqueue(notification())).not.toThrow()
    warn.mockRestore()
  })
})

describe('needs-input prompt fields', () => {
  const small = {
    promptId: 'term:pty:ssh:1:26bea7ae07aef52f093a',
    options: [
      { optionId: 'allow_once', label: 'Allow once', role: 'approve' as const },
      { optionId: 'reject_once', label: 'Reject', role: 'deny' as const }
    ]
  }

  function promptHarness(input: {
    allows: boolean
    prompt?: MobilePushPrompt | null
    promptFor?: () => MobilePushPrompt | null
  }) {
    const sends: SendCall[] = []
    const devices = [{ deviceId: 'a', pushRegistration: registration() }]
    const client = {
      send: vi.fn(async (call: SendCall) => {
        sends.push(call)
        return {
          ok: true as const,
          results: call.registrationIds.map((registrationId) => ({
            registrationId,
            status: 'queued' as const
          }))
        }
      })
    } as unknown as PushGatewayClient
    const dispatcher = new PushDispatcher({
      client,
      registry: {
        listDevices: () => devices,
        setPushRegistration: () => true
      },
      scheduleRetry: () => undefined,
      promptCategory: { allows: () => input.allows, refresh: () => undefined },
      promptFor: input.promptFor ?? (() => input.prompt ?? null)
    })
    return { dispatcher, sends }
  }

  it("keeps today's payload when the gateway has not advertised support", async () => {
    const harness = promptHarness({ allows: false, prompt: small })
    harness.dispatcher.enqueue(notification({ agentState: 'blocked', paneKey: 'pane-1' }))
    await flush()
    expect(harness.sends[0]?.notification).not.toHaveProperty('category')
    expect(harness.sends[0]?.notification).not.toHaveProperty('prompt')
    expect(harness.sends[0]?.notification.agentState).toBe('needs-input')
  })

  it('attaches a category and prompt that fit', async () => {
    const harness = promptHarness({ allows: true, prompt: small })
    harness.dispatcher.enqueue(
      notification({
        agentState: 'blocked',
        paneKey: 'pane-1',
        title: 'Needs you',
        body: 'Bash'
      })
    )
    await flush()
    expect(harness.sends[0]?.notification.category).toBe('orca.prompt')
    expect(harness.sends[0]?.notification.prompt).toEqual(small)
    expect(
      new TextEncoder().encode(JSON.stringify(harness.sends[0]?.notification)).byteLength
    ).toBeLessThanOrEqual(3000)
  })

  it('keeps the category when the prompt would pass 3000 bytes', async () => {
    const fat = {
      promptId: 'p'.repeat(512),
      options: Array.from({ length: 12 }, (_, index) => ({
        optionId: `${index}`.padStart(256, 'o'),
        label: 'l'.repeat(80),
        role: 'approve' as const
      }))
    }
    const harness = promptHarness({ allows: true, prompt: fat })
    harness.dispatcher.enqueue(notification({ agentState: 'blocked' }))
    await flush()
    expect(harness.sends[0]?.notification.category).toBe('orca.prompt')
    expect(harness.sends[0]?.notification).not.toHaveProperty('prompt')
    expect(
      new TextEncoder().encode(JSON.stringify(harness.sends[0]?.notification)).byteLength
    ).toBeLessThanOrEqual(3000)
  })

  it('still sends the original alert when prompt lookup throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const harness = promptHarness({
      allows: true,
      promptFor: () => {
        throw new Error('lookup')
      }
    })
    harness.dispatcher.enqueue(notification({ agentState: 'blocked' }))
    await flush()
    expect(harness.sends).toHaveLength(1)
    expect(harness.sends[0]?.notification).not.toHaveProperty('category')
    warn.mockRestore()
  })

  it('does not put a category on a finished alert or a dismissal', async () => {
    const harness = promptHarness({ allows: true, prompt: small })
    harness.dispatcher.enqueue(notification({ agentState: 'done' }))
    harness.dispatcher.enqueue({
      type: 'dismiss',
      notificationId: 'agent:one',
      notificationSeq: 8,
      notificationEpoch: 'epoch-1'
    })
    await flush()
    expect(harness.sends).toHaveLength(2)
    expect(harness.sends.every((send) => !('category' in send.notification))).toBe(true)
  })
})

describe('mapPushAgentState', () => {
  it.each([
    ['waiting', 'needs-input'],
    [undefined, 'finished']
  ] as const)('maps agent-task-complete %s to %s', (agentState, expected) => {
    expect(mapPushAgentState('agent-task-complete', agentState)).toBe(expected)
  })

  it('leaves non-agent sources without a state', () => {
    expect(mapPushAgentState('terminal-bell', undefined)).toBeNull()
  })
})
