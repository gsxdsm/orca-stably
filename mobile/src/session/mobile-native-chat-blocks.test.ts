import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { foldToolMessages, splitNativeChatBlocks } from './mobile-native-chat-blocks'

function msg(
  role: NativeChatMessage['role'],
  blocks: NativeChatMessage['blocks'],
  id: string = role
): NativeChatMessage {
  return { id, role, blocks, timestamp: 0, source: 'transcript' }
}

describe('splitNativeChatBlocks', () => {
  it('separates prose from tool blocks', () => {
    const { prose, tools } = splitNativeChatBlocks([
      { type: 'text', text: 'hi' },
      { type: 'tool-call', name: 'Bash', input: {} },
      { type: 'tool-result', output: 'ok' }
    ])
    expect(prose.map((b) => b.type)).toEqual(['text'])
    expect(tools.map((b) => b.type)).toEqual(['tool-call', 'tool-result'])
  })
})

describe('foldToolMessages', () => {
  it('folds tool-call-only assistant messages and result messages into the prose turn', () => {
    const folded = foldToolMessages([
      msg('assistant', [{ type: 'text', text: 'doing' }], 'a0'),
      msg('assistant', [{ type: 'tool-call', name: 'Bash', input: {} }], 'a1'),
      msg('tool', [{ type: 'tool-result', output: 'done' }], 't1'),
      msg('assistant', [{ type: 'tool-call', name: 'Edit', input: {} }], 'a2'),
      msg('tool', [{ type: 'tool-result', output: 'ok' }], 't2')
    ])
    expect(folded).toHaveLength(1)
    expect(folded[0]!.blocks.map((b) => b.type)).toEqual([
      'text',
      'tool-call',
      'tool-result',
      'tool-call',
      'tool-result'
    ])
  })

  it('starts a new turn at the next prose assistant message', () => {
    const folded = foldToolMessages([
      msg('assistant', [{ type: 'text', text: 't1' }], 'a0'),
      msg('assistant', [{ type: 'tool-call', name: 'Bash', input: {} }], 'a1'),
      msg('assistant', [{ type: 'text', text: 't2' }], 'a2')
    ])
    expect(folded.map((m) => m.id)).toEqual(['a0', 'a2'])
  })

  it('keeps a tool message standalone when no assistant precedes it', () => {
    const folded = foldToolMessages([msg('tool', [{ type: 'tool-result', output: 'x' }])])
    expect(folded).toHaveLength(1)
    expect(folded[0]!.role).toBe('tool')
  })

  it('does not merge across a user message', () => {
    const folded = foldToolMessages([
      msg('assistant', [{ type: 'tool-call', name: 'Bash', input: {} }], 'a'),
      msg('user', [{ type: 'text', text: 'q' }], 'u'),
      msg('tool', [{ type: 'tool-result', output: 'r' }], 't')
    ])
    expect(folded.map((m) => m.role)).toEqual(['assistant', 'user', 'tool'])
  })
})
