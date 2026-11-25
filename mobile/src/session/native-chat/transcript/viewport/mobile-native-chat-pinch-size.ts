import { boundNativeChatTextSize } from '../../preferences/native-chat-text-size-range'

// Web resizes in quarter points so the text follows the fingers; native keeps whole points, since
// frame-level sizes repaint recycled iOS paragraphs with stale clipped content.
const WEB_STEP = 0.25

export function nativeChatPinchLiveSize(base: number, scale: number, web: boolean): number {
  const bounded = boundNativeChatTextSize(Number.isFinite(scale) ? base * scale : base)
  return web ? Math.round(bounded / WEB_STEP) * WEB_STEP : Math.round(bounded)
}

/** The whole-point size a release saves, or null when the pinch lands back on the saved size. */
export function nativeChatPinchCommitSize(live: number | null, saved: number): number | null {
  if (live === null) {
    return null
  }
  const next = boundNativeChatTextSize(Math.round(live))
  return next === saved ? null : next
}
