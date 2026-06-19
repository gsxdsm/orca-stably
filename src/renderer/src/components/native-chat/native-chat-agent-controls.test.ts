import { describe, expect, it } from 'vitest'
import {
  applyThinkingPrefix,
  defaultNativeChatControlSelection,
  findControlOption,
  resolveNativeChatAgentControls,
  thinkingPrefixForSelection
} from './native-chat-agent-controls'

describe('resolveNativeChatAgentControls', () => {
  it('gives Claude all three controls (mode/thinking/model)', () => {
    const c = resolveNativeChatAgentControls('claude')
    expect(c.mode?.mechanism).toBe('raw')
    expect(c.thinking?.mechanism).toBe('prepend')
    expect(c.model?.mechanism).toBe('command')
  })

  it('is case-insensitive and treats openclaude like claude', () => {
    expect(resolveNativeChatAgentControls('CLAUDE').thinking).toBeDefined()
    expect(resolveNativeChatAgentControls('openclaude').thinking).toBeDefined()
  })

  it('omits the thinking control for Codex (no keyword mechanism)', () => {
    const c = resolveNativeChatAgentControls('codex')
    expect(c.thinking).toBeUndefined()
    expect(c.mode?.mechanism).toBe('raw')
    expect(c.model?.mechanism).toBe('command')
  })

  it('returns no controls for unknown agents (we invent nothing)', () => {
    expect(resolveNativeChatAgentControls('gemini')).toEqual({})
    expect(resolveNativeChatAgentControls('')).toEqual({})
  })
})

describe('mode control cycles via Shift+Tab', () => {
  it('uses the Shift+Tab escape sequence as its single cycle payload', () => {
    const c = resolveNativeChatAgentControls('claude')
    expect(c.mode?.options).toHaveLength(1)
    expect(c.mode?.options[0]?.payload).toBe('\x1b[Z')
  })
})

describe('model commands', () => {
  it('emits /model <name> lines for Claude families', () => {
    const c = resolveNativeChatAgentControls('claude')
    const ids = c.model?.options.map((o) => o.payload)
    expect(ids).toEqual(['/model opus', '/model sonnet', '/model haiku'])
  })
})

describe('thinking prefix mechanism', () => {
  const controls = resolveNativeChatAgentControls('claude')

  it('Normal selection produces no prefix and sends the draft verbatim', () => {
    const prefix = thinkingPrefixForSelection(controls, { thinking: 'normal' })
    expect(prefix).toBe('')
    expect(applyThinkingPrefix(prefix, 'fix the bug')).toBe('fix the bug')
  })

  it('maps each level to its keyword prefix', () => {
    expect(thinkingPrefixForSelection(controls, { thinking: 'think' })).toBe('think ')
    expect(thinkingPrefixForSelection(controls, { thinking: 'think-hard' })).toBe('think hard ')
    expect(thinkingPrefixForSelection(controls, { thinking: 'ultrathink' })).toBe('ultrathink ')
  })

  it('prepends the keyword to the message body', () => {
    const prefix = thinkingPrefixForSelection(controls, { thinking: 'ultrathink' })
    expect(applyThinkingPrefix(prefix, 'design the API')).toBe('ultrathink design the API')
  })

  it('returns no prefix when the agent has no thinking control', () => {
    const codex = resolveNativeChatAgentControls('codex')
    expect(thinkingPrefixForSelection(codex, { thinking: 'think' })).toBe('')
  })
})

describe('selection helpers', () => {
  it('seeds defaults from the resolved control set', () => {
    const controls = resolveNativeChatAgentControls('claude')
    expect(defaultNativeChatControlSelection(controls)).toEqual({
      mode: 'cycle',
      thinking: 'normal',
      model: 'sonnet'
    })
  })

  it('findControlOption falls back to the default for unknown ids', () => {
    const controls = resolveNativeChatAgentControls('claude')
    const thinking = controls.thinking
    expect(thinking).toBeDefined()
    if (!thinking) {
      return
    }
    expect(findControlOption(thinking, 'nope').id).toBe('normal')
    expect(findControlOption(thinking, 'think').id).toBe('think')
  })
})
