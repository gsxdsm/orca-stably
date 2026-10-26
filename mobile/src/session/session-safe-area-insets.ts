import type { EdgeInsets } from 'react-native-safe-area-context'

// A sideways iPhone clears its home indicator in 21pt; the Duo's inner screen sideways reports more.
export const IOS_LANDSCAPE_BOTTOM_INSET_MAX = 21

// Folded Duo: the dock sits just above the home indicator (8pt up, 5pt tall) instead of 34pt up.
export const FOLDED_DUO_BOTTOM_INSET_MAX = 14

/** The session's insets: on iOS sideways or folded full width, the bottom is capped so the input dock sits low. */
export function resolveSessionSafeAreaInsets(
  insets: EdgeInsets,
  args: { isIos: boolean; isLandscape: boolean; foldedFullWidth: boolean }
): EdgeInsets {
  if (!args.isIos) {
    return insets
  }
  const max = args.foldedFullWidth
    ? FOLDED_DUO_BOTTOM_INSET_MAX
    : args.isLandscape
      ? IOS_LANDSCAPE_BOTTOM_INSET_MAX
      : Infinity
  return insets.bottom <= max ? insets : { ...insets, bottom: max }
}
