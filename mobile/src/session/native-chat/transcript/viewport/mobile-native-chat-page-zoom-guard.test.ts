import { describe, expect, it } from 'vitest'
import { guardMobileNativeChatAgainstPageZoom } from './mobile-native-chat-page-zoom-guard'
import { nativeChatPinchCommitSize, nativeChatPinchLiveSize } from './mobile-native-chat-pinch-size'

function fire(target: EventTarget, type: string, touches = 0): boolean {
  const event = new Event(type, { cancelable: true, bubbles: true })
  Object.defineProperty(event, 'touches', { value: { length: touches } })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

describe('repeated chat pinches', () => {
  it('resize the text and refuse page zoom on every cycle, not only the first', () => {
    const scroller = new EventTarget()
    const unguard = guardMobileNativeChatAgainstPageZoom(scroller)
    let saved = 14
    for (const scale of [1.3, 0.8, 1.5, 0.7]) {
      expect(fire(scroller, 'gesturestart')).toBe(true)
      expect(fire(scroller, 'touchmove', 2)).toBe(true)
      expect(fire(scroller, 'gesturechange')).toBe(true)
      const next = nativeChatPinchCommitSize(nativeChatPinchLiveSize(saved, scale, true), saved)
      expect(next).not.toBeNull()
      expect(next).not.toBe(saved)
      saved = next ?? saved
    }
    // One finger still scrolls.
    expect(fire(scroller, 'touchmove', 1)).toBe(false)
    unguard()
    expect(fire(scroller, 'gesturestart')).toBe(false)
  })
})
