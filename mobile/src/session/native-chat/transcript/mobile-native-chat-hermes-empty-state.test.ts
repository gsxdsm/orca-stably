import { describe, expect, it } from 'vitest'
import { mobileNativeChatEmptyState } from './mobile-native-chat-render-data'

describe('mobileNativeChatEmptyState', () => {
  it.each(['waiting-session', 'awaiting-transcript'] as const)(
    'shows Hermes connecting while %s',
    (status) => {
      expect(mobileNativeChatEmptyState(status, 'hermes')?.title).toBe('Connecting to Hermes…')
    }
  )
})
