import { describe, expect, it } from 'vitest'
import { resolveMobileNativeChat } from './mobile-native-chat-eligibility'

describe('resolveMobileNativeChat', () => {
  it('only opens a Hermes terminal overlay when the host advertises the reader', () => {
    const tab = { type: 'terminal' as const, launchAgent: 'hermes' }
    expect(resolveMobileNativeChat(tab, true)).toBeNull()
    expect(resolveMobileNativeChat(tab, true, true)).toMatchObject({ agent: 'hermes' })
    expect(resolveMobileNativeChat(tab, false, true)).toBeNull()
  })
})
