import { describe, expect, it } from 'vitest'
import { watchSnapshotSchema, type WatchFeedItem, type WatchPrompt } from './watch-contract'
import {
  buildWatchSnapshot,
  type WatchSnapshotChat,
  type WatchSnapshotTerminal
} from './watch-snapshot'

const HOST = { hostId: 'host-1', name: 'Studio', connection: 'connected' as const }

function chat(overrides: Partial<WatchSnapshotChat> = {}): WatchSnapshotChat {
  return {
    hostId: 'host-1',
    sessionId: 'chat-1',
    workspaceId: 'wt-1',
    workspaceName: 'orca',
    agent: 'claude',
    projectedStatus: 'idle',
    updatedAt: 1,
    ...overrides
  }
}

function terminal(overrides: Partial<WatchSnapshotTerminal> = {}): WatchSnapshotTerminal {
  return {
    hostId: 'host-1',
    paneKey: 'pane-1',
    workspaceId: 'wt-1',
    workspaceName: 'orca',
    agent: 'codex',
    state: 'done',
    updatedAt: 1,
    ...overrides
  }
}

function prompt(sessionKey: string): WatchPrompt {
  return {
    hostId: 'host-1',
    promptId: 'prompt-1',
    sessionKey,
    kind: 'permission',
    title: 'Allow the command',
    options: [{ optionId: 'yes', label: 'Allow', role: 'approve' }],
    createdAt: 50
  }
}

function feed(id: string, at: number): WatchFeedItem {
  return { id, hostId: 'host-1', title: id, body: 'body', at, kind: 'other' }
}

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

describe('buildWatchSnapshot', () => {
  it('sorts needs-input, then working, then the rest by recency', () => {
    const snapshot = buildWatchSnapshot({
      now: 100,
      hosts: [HOST],
      chats: [
        chat({
          sessionId: 'idle',
          projectedStatus: 'idle',
          updatedAt: 90,
          conversationName: 'Named'
        }),
        chat({ sessionId: 'working', projectedStatus: 'working', updatedAt: 10 })
      ],
      terminals: [
        terminal({ paneKey: 'done', state: 'done', updatedAt: 80, taskTitle: 'Task' }),
        terminal({ paneKey: 'blocked', state: 'blocked', updatedAt: 5, displayName: 'Pane' })
      ],
      prompts: [],
      feed: []
    })

    expect(snapshot.sessions.map((session) => session.key)).toEqual([
      'host-1|term|blocked',
      'host-1|chat|working',
      'host-1|chat|idle',
      'host-1|term|done'
    ])
    expect(snapshot.sessions[0]?.title).toBe('Pane')
    expect(snapshot.sessions[2]?.title).toBe('Named')
    expect(snapshot.sessions[3]?.title).toBe('Task')
    expect(watchSnapshotSchema.parse(snapshot)).toEqual(snapshot)
  })

  it('marks a pending prompt as needs-input and allows send only while connected', () => {
    const snapshot = buildWatchSnapshot({
      now: 100,
      hosts: [{ ...HOST, connection: 'connecting' }],
      chats: [chat({ projectedStatus: 'working', conversationName: 'Review', updatedAt: 4 })],
      terminals: [terminal({ structuredHostOwned: true, paneKey: 'owned', state: 'working' })],
      prompts: [prompt('host-1|chat|chat-1')],
      feed: []
    })

    expect(snapshot.sessions).toEqual([
      expect.objectContaining({
        key: 'host-1|chat|chat-1',
        status: 'needs-input',
        pendingPromptId: 'prompt-1',
        canSend: false,
        title: 'Review'
      })
    ])
  })

  it('trims latest lines and keeps the 20 newest feed items', () => {
    const snapshot = buildWatchSnapshot({
      now: 100,
      hosts: [HOST],
      chats: [chat({ lastAssistantMessage: 'x'.repeat(400), latestPrompt: 'prompt' })],
      terminals: [],
      prompts: [],
      feed: Array.from({ length: 25 }, (_, index) => feed(`n-${index}`, index))
    })

    expect(snapshot.sessions[0]?.latest).toHaveLength(280)
    expect(snapshot.feed.map((item) => item.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `n-${24 - index}`)
    )
  })

  it('drops old done and idle rows, then working rows, to stay under 60KB', () => {
    const fat = 'y'.repeat(280)
    const snapshot = buildWatchSnapshot({
      now: 100,
      hosts: [HOST],
      chats: [
        chat({ sessionId: 'need', projectedStatus: 'attention', updatedAt: 1, latestPrompt: 'ask' })
      ],
      terminals: [
        terminal({ paneKey: 'work', state: 'working', updatedAt: 2, lastAssistantMessage: fat }),
        ...Array.from({ length: 180 }, (_, index) =>
          terminal({
            paneKey: `done-${index}`,
            state: 'done',
            updatedAt: index,
            lastAssistantMessage: fat
          })
        )
      ],
      prompts: [],
      feed: Array.from({ length: 20 }, (_, index) => ({
        ...feed(`f-${index}`, index),
        body: fat
      }))
    })

    expect(bytes(snapshot)).toBeLessThan(60 * 1024)
    expect(snapshot.sessions.some((session) => session.key === 'host-1|chat|need')).toBe(true)
    expect(snapshot.sessions.some((session) => session.key === 'host-1|term|work')).toBe(true)
    const done = snapshot.sessions.filter((session) => session.status === 'done')
    expect(done.some((session) => session.key === 'host-1|term|done-0')).toBe(false)
    expect(done.some((session) => session.key === 'host-1|term|done-179')).toBe(true)
    expect(done.length).toBeLessThan(180)
  })

  it('drops oldest working rows only after done and idle rows are gone', () => {
    const fat = 'z'.repeat(280)
    const snapshot = buildWatchSnapshot({
      now: 100,
      hosts: [HOST],
      chats: [chat({ sessionId: 'need', projectedStatus: 'attention', updatedAt: 9 })],
      terminals: Array.from({ length: 250 }, (_, index) =>
        terminal({
          paneKey: `work-${index}`,
          state: 'working',
          updatedAt: index,
          lastAssistantMessage: fat
        })
      ),
      prompts: [],
      feed: []
    })

    expect(bytes(snapshot)).toBeLessThan(60 * 1024)
    expect(snapshot.sessions[0]?.key).toBe('host-1|chat|need')
    expect(snapshot.sessions.some((session) => session.status === 'working')).toBe(true)
    expect(snapshot.sessions.filter((session) => session.status === 'working').length).toBeLessThan(
      250
    )
  })
})
