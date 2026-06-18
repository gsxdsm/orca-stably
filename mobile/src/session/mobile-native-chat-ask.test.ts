import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { extractPendingAsk, formatAskAnswer } from './mobile-native-chat-ask'

function msg(blocks: NativeChatMessage['blocks'], id = 'm'): NativeChatMessage {
  return { id, role: 'assistant', blocks, timestamp: 0, source: 'transcript' }
}

const askInput = {
  questions: [
    {
      question: 'Pick one',
      header: 'Choice',
      multiSelect: false,
      options: [
        { label: 'A', description: 'first' },
        { label: 'B', description: 'second' }
      ]
    }
  ]
}

describe('extractPendingAsk', () => {
  it('returns the structured prompt from a pending AskUserQuestion call', () => {
    const ask = extractPendingAsk([
      msg([{ type: 'tool-call', name: 'AskUserQuestion', input: askInput }])
    ])
    expect(ask?.questions[0]).toMatchObject({
      question: 'Pick one',
      header: 'Choice',
      multiSelect: false
    })
    expect(ask?.questions[0]!.options.map((o) => o.label)).toEqual(['A', 'B'])
  })

  it('returns null once a tool-result follows the ask', () => {
    const ask = extractPendingAsk([
      msg([{ type: 'tool-call', name: 'AskUserQuestion', input: askInput }], 'a'),
      msg([{ type: 'tool-result', output: 'answered' }], 'r')
    ])
    expect(ask).toBeNull()
  })

  it('ignores non-ask tool calls', () => {
    expect(
      extractPendingAsk([msg([{ type: 'tool-call', name: 'Bash', input: { command: 'ls' } }])])
    ).toBeNull()
  })

  it('keeps the latest ask when several appear', () => {
    const ask = extractPendingAsk([
      msg([{ type: 'tool-call', name: 'AskUserQuestion', input: askInput }], 'a1'),
      msg([{ type: 'tool-result', output: 'x' }], 'r1'),
      msg([
        {
          type: 'tool-call',
          name: 'AskUserQuestion',
          input: {
            questions: [{ question: 'Second', multiSelect: false, options: [{ label: 'Z' }] }]
          }
        }
      ])
    ])
    expect(ask?.questions[0]!.question).toBe('Second')
  })
})

describe('formatAskAnswer', () => {
  it('joins selected labels per question', () => {
    const prompt = {
      questions: [
        { question: 'q1', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] },
        { question: 'q2', multiSelect: false, options: [{ label: 'C' }] }
      ]
    }
    expect(formatAskAnswer(prompt, [['A', 'B'], ['C']])).toBe('A, B\nC')
  })
})
