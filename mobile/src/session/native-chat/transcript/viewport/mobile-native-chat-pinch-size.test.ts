import { describe, expect, it } from 'vitest'
import { nativeChatPinchCommitSize, nativeChatPinchLiveSize } from './mobile-native-chat-pinch-size'

describe('chat pinch text size', () => {
  it('releases on the saved whole-point size nearest what the pinch showed', () => {
    const live = nativeChatPinchLiveSize(14, 1.37, true)
    expect(live).toBe(19.25)
    expect(nativeChatPinchCommitSize(live, 14)).toBe(19)
    expect(nativeChatPinchCommitSize(nativeChatPinchLiveSize(14, 1.02, true), 14)).toBeNull()
    expect(nativeChatPinchCommitSize(null, 14)).toBeNull()
  })

  it('keeps live and saved sizes inside the allowed range', () => {
    expect(nativeChatPinchLiveSize(14, 9, true)).toBe(24)
    expect(nativeChatPinchLiveSize(14, 0.1, true)).toBe(7)
    expect(nativeChatPinchLiveSize(14, Number.NaN, true)).toBe(14)
    expect(nativeChatPinchCommitSize(nativeChatPinchLiveSize(14, 9, true), 14)).toBe(24)
    expect(nativeChatPinchLiveSize(14, 1.37, false)).toBe(19)
  })
})
