import { describe, expect, it } from 'vitest'
import { PushSendRequestSchema } from './send-messages.js'

function notification(): Record<string, unknown> {
  return {
    notificationId: 'note-1',
    notificationSeq: 4,
    notificationEpoch: '5c9e9a1e-0000-4000-8000-000000000000',
    source: 'agent-task-complete',
    agentState: 'needs-input',
    title: 'Agent needs input',
    body: 'Waiting on your answer',
    worktreeId: 'wt-1'
  }
}

describe('send schemas', () => {

  it('rejects a notification id that could not be sent as a collapse header', () => {
    for (const notificationId of ['line\nbreak', 'nul\0byte', 'émoji', '\t']) {
      expect(
        PushSendRequestSchema.safeParse({
          v: 1,
          registrationIds: ['reg-1'],
          notification: { ...notification(), notificationId }
        }).success
      ).toBe(false)
    }
    expect(
      PushSendRequestSchema.safeParse({
        v: 1,
        registrationIds: ['reg-1'],
        notification: {
          ...notification(),
          notificationId: 'agent:repo%3A%3A%2FUsers%2Fme:pane-1:1700000000000'
        }
      }).success
    ).toBe(true)
  })

  it('dedupes repeated registration ids and keeps the first-seen order', () => {
    const parsed = PushSendRequestSchema.safeParse({
      v: 1,
      registrationIds: ['reg-b', 'reg-a', 'reg-b', 'reg-c', 'reg-a'],
      notification: notification()
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.registrationIds).toEqual(['reg-b', 'reg-a', 'reg-c'])
  })

  it('accepts a prompt category and rejects a prompt without one or on a dismissal', () => {
    const prompt = {
      promptId: 'term:pty:ssh:1:26bea7ae07aef52f093a',
      options: [
        { optionId: 'allow_once', label: 'Allow once', role: 'approve' },
        { optionId: 'reject_once', label: 'Reject', role: 'deny' }
      ]
    }
    const accepted = PushSendRequestSchema.safeParse({
      v: 1,
      registrationIds: ['reg-1'],
      notification: { ...notification(), category: 'orca.prompt', prompt }
    })
    expect(accepted.success).toBe(true)
    expect(accepted.success && accepted.data.notification.prompt).toEqual(prompt)
    expect(
      PushSendRequestSchema.safeParse({
        v: 1,
        registrationIds: ['reg-1'],
        notification: { ...notification(), prompt }
      }).success
    ).toBe(false)
    expect(
      PushSendRequestSchema.safeParse({
        v: 1,
        registrationIds: ['reg-1'],
        notification: {
          ...notification(),
          kind: 'dismiss',
          agentState: null,
          body: '',
          category: 'orca.prompt'
        }
      }).success
    ).toBe(false)
    expect(
      PushSendRequestSchema.safeParse({
        v: 1,
        registrationIds: ['reg-1'],
        notification: {
          ...notification(),
          category: 'orca.prompt',
          prompt: { ...prompt, detail: 'ls' }
        }
      }).success
    ).toBe(false)
  })

  it('rejects a prompt payload over the 3000-byte notification cap', () => {
    expect(
      PushSendRequestSchema.safeParse({
        v: 1,
        registrationIds: ['reg-1'],
        notification: {
          ...notification(),
          category: 'orca.prompt',
          prompt: {
            promptId: 'p'.repeat(512),
            options: Array.from({ length: 12 }, (_, index) => ({
              optionId: `${index}`.padStart(256, 'o'),
              label: 'l'.repeat(80),
              role: 'approve'
            }))
          }
        }
      }).success
    ).toBe(false)
  })

  it('counts duplicates against the batch cap before deduping them', () => {
    const ids = Array.from({ length: PUSH_LIMITS.maxRegistrationIdsPerSend + 1 }, () => 'reg-1')
    expect(
      PushSendRequestSchema.safeParse({ v: 1, registrationIds: ids, notification: notification() })
        .success
    ).toBe(false)
  })
})
