import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../src/shared/native-chat/native-chat-types'
import {
  buildMobileNativeChatTransientData,
  foldMobileNativeChatAgentMessages,
  foldMobileNativeChatMessages
} from './mobile-native-chat-render-data'

function assistant(id: string, text: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text }],
    timestamp: 0,
    source: 'transcript'
  }
}

function user(id: string, text: string): NativeChatMessage {
  return { id, role: 'user', blocks: [{ type: 'text', text }], timestamp: 0, source: 'transcript' }
}

const fold = (messages: NativeChatMessage[]) => foldMobileNativeChatMessages(messages, 'claude')

describe('buildMobileNativeChatTransientData', () => {
  it('keeps the phone-local image visible when the transcript replaces its optimistic echo', () => {
    const folded = fold([
      user('source', '[Image: source: /tmp/a.png]'),
      user('prompt', '[Image #1] look at this')
    ])
    const result = buildMobileNativeChatTransientData({
      folded,
      streaming: null,
      pending: [],
      imagePreviewsByMessageId: { prompt: ['file:///phone-photo.jpg'] }
    })

    expect(result.data).toHaveLength(1)
    expect(result.data[0]?.blocks).toEqual([
      { type: 'image-ref', path: '/tmp/a.png', url: 'file:///phone-photo.jpg' },
      { type: 'text', text: 'look at this' }
    ])
  })

  it('renders one bubble when the prompt is followed by its equal-timestamp image companion', () => {
    const prompt: NativeChatMessage = {
      ...user('prompt', '[Image #122] Have a sub agent add some padding'),
      timestamp: 1_736_000_000_000
    }
    const companion: NativeChatMessage = {
      ...user('companion', '[Image: source: /var/folders/orca-paste.png]'),
      timestamp: 1_736_000_000_000
    }
    const result = buildMobileNativeChatTransientData({
      folded: fold([prompt, companion]),
      streaming: null,
      pending: [],
      imagePreviewsByMessageId: { prompt: ['file:///phone-photo.jpg'] }
    })

    expect(result.data).toHaveLength(1)
    expect(result.data[0]?.id).toBe('prompt')
    expect(result.data[0]?.blocks).toEqual([
      {
        type: 'image-ref',
        path: '/var/folders/orca-paste.png',
        url: 'file:///phone-photo.jpg'
      },
      { type: 'text', text: 'Have a sub agent add some padding' }
    ])
  })

  it('restores the local preview onto a marker-only transcript turn', () => {
    const result = buildMobileNativeChatTransientData({
      folded: fold([user('prompt', '[Image #1]')]),
      streaming: null,
      pending: [],
      imagePreviewsByMessageId: { prompt: ['file:///phone-photo.jpg'] }
    })

    expect(result.data[0]?.blocks).toEqual([{ type: 'image-ref', url: 'file:///phone-photo.jpg' }])
  })
})

describe('foldMobileNativeChatMessages', () => {
  function toolCall(id: string): NativeChatMessage {
    return {
      id,
      role: 'assistant',
      blocks: [{ type: 'tool-call', name: 'Bash', input: { command: 'command -v orca-ide' } }],
      timestamp: 0,
      source: 'transcript'
    }
  }

  function toolResult(id: string, output: string): NativeChatMessage {
    return {
      id,
      role: 'tool',
      blocks: [{ type: 'tool-result', output }],
      timestamp: 0,
      source: 'transcript'
    }
  }

  function planFrame(head: string): NativeChatMessage {
    return {
      id: 'plan',
      role: 'system',
      timestamp: 0,
      source: 'transcript',
      blocks: [
        {
          type: 'text',
          text: 'codex · notification:turn/plan/updated',
          providerFrame: {
            provider: 'codex',
            kind: 'notification:turn/plan/updated',
            payload: { head, byteLength: head.length, digest: 'digest', truncated: false }
          }
        }
      ]
    }
  }

  it('draws a Codex plan update where it happened, as an update_plan call', () => {
    const folded = fold([
      assistant('a1', 'Working.'),
      toolCall('c1'),
      toolResult('r1', 'ok'),
      planFrame('{"plan":[{"step":"Port rows","status":"inProgress"}]}'),
      toolCall('c2'),
      toolResult('r2', 'ok')
    ])
    expect(folded.map((message) => message.id)).toEqual(['a1', 'plan', 'c2'])
    expect(folded[1]).toMatchObject({
      role: 'assistant',
      blocks: [{ type: 'tool-call', name: 'update_plan', state: 'completed' }]
    })
  })
})

// Claude may consume queued commands without a user record; unmatched echoes must stay at their send position rather than trail every later turn.
describe("mobile shows the conversation, never a subagent's rows", () => {
  it("keeps the spawn's one line and drops what the subagent said and did", () => {
    const child = { agentId: 'task-1', producerKind: 'agent' as const }
    const folded = fold([
      user('ask', 'review the PR'),
      {
        id: 'spawn',
        role: 'system',
        blocks: [{ type: 'text', text: 'Kicked off 1 subagent' }],
        timestamp: 0,
        source: 'transcript'
      },
      { ...assistant('child-said', 'The PR is CLEAN.'), ...child },
      {
        id: 'child-grep',
        role: 'assistant',
        blocks: [{ type: 'tool-call', name: 'Grep', input: {} }],
        timestamp: 0,
        source: 'transcript',
        ...child
      },
      assistant('answer', 'Delegated; nothing to fix.')
    ])

    expect(folded.map((message) => message.id)).toEqual(['ask', 'spawn', 'answer'])
    expect(folded[2]?.blocks).toEqual([{ type: 'text', text: 'Delegated; nothing to fix.' }])
  })

  it('keeps a subagent transcript when that agent is the one being folded', () => {
    const child = { agentId: 'task-1', producerKind: 'agent' as const }
    const rows = [
      user('ask', 'review the PR'),
      { ...assistant('child-said', 'The PR is CLEAN.'), ...child },
      {
        id: 'child-grep',
        role: 'assistant' as const,
        blocks: [{ type: 'tool-call' as const, name: 'Grep', input: {} }],
        timestamp: 0,
        source: 'transcript' as const,
        ...child
      }
    ]
    expect(fold(rows).map((message) => message.id)).toEqual(['ask'])
    const agentFold = foldMobileNativeChatAgentMessages(rows, 'claude')
    expect(agentFold.map((message) => message.id)).toContain('child-said')
    expect(
      agentFold.some(
        (message) =>
          message.id === 'child-grep' ||
          message.blocks.some((block) => block.type === 'tool-call' && block.name === 'Grep')
      )
    ).toBe(true)
  })
})
