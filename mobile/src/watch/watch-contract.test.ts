import { describe, expect, it } from 'vitest'
import {
  watchCommandSchema,
  watchReplySchema,
  watchSnapshotSchema,
  type WatchSnapshot
} from './watch-contract'

const snapshot: WatchSnapshot = {
  v: 1,
  generatedAt: 1_700_000_000_000,
  hosts: [{ hostId: 'host-1', name: 'Studio', connection: 'connected' }],
  sessions: [
    {
      key: 'host-1|chat|session-1',
      hostId: 'host-1',
      title: 'Review',
      agent: 'claude',
      workspace: 'orca',
      status: 'needs-input',
      latest: 'Allow the command?',
      updatedAt: 10,
      canSend: true,
      pendingPromptId: 'prompt-1'
    }
  ],
  prompts: [
    {
      hostId: 'host-1',
      promptId: 'prompt-1',
      sessionKey: 'host-1|chat|session-1',
      kind: 'permission',
      title: 'Allow the command?',
      options: [
        { optionId: 'yes', label: 'Allow', role: 'approve' },
        { optionId: 'no', label: 'Deny', role: 'deny' }
      ],
      createdAt: 9
    }
  ],
  feed: [
    {
      id: 'note-1',
      hostId: 'host-1',
      sessionKey: 'host-1|chat|session-1',
      title: 'Needs you',
      body: 'Allow the command?',
      at: 11,
      kind: 'needs-input'
    }
  ]
}

describe('watch contract', () => {
  it('round-trips a snapshot, every command, and both replies', () => {
    expect(watchSnapshotSchema.parse(snapshot)).toEqual(snapshot)
    const commands = [
      { v: 1, id: 'cmd-1', type: 'refresh' },
      {
        v: 1,
        id: 'cmd-2',
        type: 'respond',
        hostId: 'host-1',
        promptId: 'prompt-1',
        optionId: 'yes'
      },
      { v: 1, id: 'cmd-3', type: 'send', sessionKey: 'host-1|chat|session-1', text: 'ship it' },
      { v: 1, id: 'cmd-4', type: 'openOnPhone', sessionKey: 'host-1|term|pane-1' }
    ]
    for (const command of commands) {
      expect(watchCommandSchema.parse(command)).toEqual(command)
    }
    expect(watchReplySchema.parse({ v: 1, id: 'cmd-1', ok: true, snapshot })).toEqual({
      v: 1,
      id: 'cmd-1',
      ok: true,
      snapshot
    })
    expect(
      watchReplySchema.parse({ v: 1, id: 'cmd-2', ok: false, reason: 'phone_unavailable' })
    ).toEqual({
      v: 1,
      id: 'cmd-2',
      ok: false,
      reason: 'phone_unavailable'
    })
  })

  it('rejects an oversized send and an unknown failure reason', () => {
    expect(
      watchCommandSchema.safeParse({
        v: 1,
        id: 'cmd-5',
        type: 'send',
        sessionKey: 'host-1|chat|session-1',
        text: 'x'.repeat(2001)
      }).success
    ).toBe(false)
    expect(
      watchReplySchema.safeParse({ v: 1, id: 'cmd-6', ok: false, reason: 'later' }).success
    ).toBe(false)
    expect(watchSnapshotSchema.safeParse({ ...snapshot, v: 2 }).success).toBe(false)
  })
})
