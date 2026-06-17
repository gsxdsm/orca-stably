import { describe, it, expect } from 'vitest'
import { decideInitialAgentTabViewMode } from './native-chat-initial-view-mode'

describe('decideInitialAgentTabViewMode', () => {
  it("returns 'chat' when the opt-in default setting is on", () => {
    expect(decideInitialAgentTabViewMode(true)).toBe('chat')
  })

  it('returns undefined (implicit terminal default) when the setting is off', () => {
    expect(decideInitialAgentTabViewMode(false)).toBeUndefined()
  })

  it('returns undefined when the setting is missing (legacy settings)', () => {
    expect(decideInitialAgentTabViewMode(undefined)).toBeUndefined()
  })
})
