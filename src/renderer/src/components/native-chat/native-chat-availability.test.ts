import { describe, it, expect } from 'vitest'
import { canToggleNativeChat } from './native-chat-availability'

describe('canToggleNativeChat', () => {
  it('allows a terminal launched with a coding agent', () => {
    expect(canToggleNativeChat({ contentType: 'terminal', launchAgent: 'claude' })).toBe(true)
  })

  it('allows a terminal with a live detected agent but no launchAgent', () => {
    expect(
      canToggleNativeChat({ contentType: 'terminal', launchAgent: null, hasDetectedAgent: true })
    ).toBe(true)
  })

  it('rejects a plain shell terminal with no agent', () => {
    expect(
      canToggleNativeChat({ contentType: 'terminal', launchAgent: null, hasDetectedAgent: false })
    ).toBe(false)
  })

  it('rejects a plain shell terminal with everything omitted', () => {
    expect(canToggleNativeChat({ contentType: 'terminal' })).toBe(false)
  })

  it('rejects an editor tab even if an agent hint were somehow present', () => {
    expect(
      canToggleNativeChat({ contentType: 'editor', launchAgent: 'codex', hasDetectedAgent: true })
    ).toBe(false)
  })

  it('rejects a browser tab', () => {
    expect(canToggleNativeChat({ contentType: 'browser', hasDetectedAgent: true })).toBe(false)
  })
})
