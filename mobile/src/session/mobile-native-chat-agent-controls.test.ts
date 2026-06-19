import { describe, expect, it } from 'vitest'
import {
  applyThinkingPrefix,
  defaultNativeChatControlSelection,
  resolveNativeChatAgentControls,
  thinkingPrefixForSelection
} from './mobile-native-chat-agent-controls'
// The canonical desktop registry. Mobile can't import these VALUES in its RN
// bundle (Metro), but vitest runs on Node, so we cross-check the inlined copy
// against the source of truth to catch drift between the two registries.
import { resolveNativeChatAgentControls as resolveDesktop } from '../../../src/renderer/src/components/native-chat/native-chat-agent-controls'

describe('mobile native-chat agent controls', () => {
  it('Claude thinking prefixes match the documented keywords', () => {
    const controls = resolveNativeChatAgentControls('claude')
    expect(thinkingPrefixForSelection(controls, { thinking: 'normal' })).toBe('')
    expect(thinkingPrefixForSelection(controls, { thinking: 'think' })).toBe('think ')
    expect(thinkingPrefixForSelection(controls, { thinking: 'think-hard' })).toBe('think hard ')
    expect(thinkingPrefixForSelection(controls, { thinking: 'ultrathink' })).toBe('ultrathink ')
  })

  it('prepends to the body and is a no-op for Normal', () => {
    expect(applyThinkingPrefix('', 'hi')).toBe('hi')
    expect(applyThinkingPrefix('ultrathink ', 'hi')).toBe('ultrathink hi')
  })

  it('omits controls for unknown agents', () => {
    expect(resolveNativeChatAgentControls('mystery')).toEqual({})
  })

  it('seeds the same defaults as the desktop registry', () => {
    for (const agent of ['claude', 'codex', 'unknown']) {
      expect(defaultNativeChatControlSelection(resolveNativeChatAgentControls(agent))).toEqual(
        defaultNativeChatControlSelection(resolveDesktop(agent))
      )
    }
  })

  it('stays in sync with the canonical desktop registry', () => {
    for (const agent of ['claude', 'openclaude', 'codex', 'gemini', '']) {
      expect(resolveNativeChatAgentControls(agent)).toEqual(resolveDesktop(agent))
    }
  })
})
