import { describe, it, expect } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { assembleNativeChatSession } from './native-chat-session-assembler'

function msg(
  overrides: Partial<NativeChatMessage> & Pick<NativeChatMessage, 'id'>
): NativeChatMessage {
  return {
    role: 'assistant',
    blocks: [{ type: 'text', text: '' }],
    timestamp: 0,
    source: 'transcript',
    ...overrides
  }
}

describe('assembleNativeChatSession', () => {
  it('collapses the same turn from hook + transcript to one message, transcript wins', () => {
    const hook = msg({
      id: 'hook-1',
      source: 'hook',
      turnId: 't1',
      blocks: [{ type: 'text', text: 'partial...' }],
      timestamp: 100
    })
    const transcript = msg({
      id: 'transcript-1',
      source: 'transcript',
      turnId: 't1',
      blocks: [{ type: 'text', text: 'final answer' }],
      timestamp: 100
    })

    const session = assembleNativeChatSession({
      sources: { transcript: [transcript], hook: [hook] },
      sessionId: 's1',
      agent: 'claude'
    })

    expect(session.messages).toHaveLength(1)
    expect(session.messages[0].source).toBe('transcript')
    expect(session.messages[0].blocks).toEqual([{ type: 'text', text: 'final answer' }])
    expect(session.status).toBe('ready')
  })

  it('sorts stably by timestamp then id for out-of-order appends', () => {
    const a = msg({ id: 'b', timestamp: 200, blocks: [{ type: 'text', text: 'four' }] })
    const b = msg({ id: 'a', timestamp: 100, blocks: [{ type: 'text', text: 'one' }] })
    const c = msg({ id: 'a2', timestamp: 100, blocks: [{ type: 'text', text: 'three' }] })
    const d = msg({ id: 'a1', timestamp: 100, blocks: [{ type: 'text', text: 'two' }] })

    const session = assembleNativeChatSession({
      sources: { transcript: [a, b, c, d] },
      sessionId: 's1',
      agent: 'claude'
    })

    expect(session.messages.map((m) => m.id)).toEqual(['a', 'a1', 'a2', 'b'])
  })

  it('drops a scrape message when a transcript message covers the same turn', () => {
    const scrape = msg({
      id: 'scrape-1',
      source: 'scrape',
      role: 'user',
      blocks: [{ type: 'text', text: 'Run the tests' }],
      timestamp: null
    })
    const transcript = msg({
      id: 'transcript-1',
      source: 'transcript',
      role: 'user',
      blocks: [{ type: 'text', text: 'run the   tests' }],
      timestamp: 50
    })

    const session = assembleNativeChatSession({
      sources: { transcript: [transcript], scrape: [scrape] },
      sessionId: 's1',
      agent: 'claude'
    })

    expect(session.messages).toHaveLength(1)
    expect(session.messages[0].source).toBe('transcript')
  })

  it('drops a scrape duplicate even when scrape is processed first by id', () => {
    const scrape = msg({
      id: 'shared-id',
      source: 'scrape',
      turnId: 't9',
      timestamp: 10
    })
    const transcript = msg({
      id: 'shared-id',
      source: 'transcript',
      turnId: 't9',
      timestamp: 10
    })

    const session = assembleNativeChatSession({
      sources: { transcript: [transcript], scrape: [scrape] },
      sessionId: 's1',
      agent: 'claude'
    })

    expect(session.messages).toHaveLength(1)
    expect(session.messages[0].source).toBe('transcript')
  })

  it('assembles an empty session to status empty without throwing', () => {
    const session = assembleNativeChatSession({
      sources: {},
      sessionId: null,
      agent: 'claude'
    })

    expect(session.messages).toEqual([])
    expect(session.status).toBe('empty')
    expect(session.sessionId).toBeNull()
  })

  it('honors an explicit status override', () => {
    const session = assembleNativeChatSession({
      sources: {},
      sessionId: null,
      agent: 'claude',
      status: 'loading'
    })
    expect(session.status).toBe('loading')
  })

  it('carries an error message when provided', () => {
    const session = assembleNativeChatSession({
      sources: {},
      sessionId: null,
      agent: 'claude',
      status: 'error',
      error: 'transcript unreadable'
    })
    expect(session.status).toBe('error')
    expect(session.error).toBe('transcript unreadable')
  })
})
