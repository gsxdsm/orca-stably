// Decides whether a tab's long-press (which surfaces as a `contextmenu` event on
// touch/pen) should toggle the native-chat view mode instead of opening the tab
// context menu. Kept pure so the gesture rule is unit-testable; SortableTab owns
// the pointer plumbing and the actual store action.
//
// Why reuse `contextmenu` rather than a manual press timer: on touch the browser
// already recognizes the long-press and emits `contextmenu` (this is how the tab
// menu opens on mobile today). Diverting that same event avoids racing the OS
// gesture with our own timer and keeps desktop right-click (pointerType 'mouse')
// on the existing menu path untouched.

/** Pointer types produced by a finger or stylus long-press. A mouse right-click
 *  reports 'mouse' and must keep opening the context menu. */
const TOUCH_POINTER_TYPES = new Set(['touch', 'pen'])

export function isTouchLikePointerType(pointerType: string | undefined | null): boolean {
  return pointerType != null && TOUCH_POINTER_TYPES.has(pointerType)
}

/** True when a long-press should toggle the chat/terminal view mode: the gesture
 *  came from touch/pen AND the tab is an agent terminal eligible for the toggle.
 *  Mouse right-clicks and non-agent tabs fall through to the normal menu. */
export function shouldToggleViewModeFromLongPress(
  pointerType: string | undefined | null,
  canToggleViewMode: boolean
): boolean {
  return canToggleViewMode && isTouchLikePointerType(pointerType)
}
