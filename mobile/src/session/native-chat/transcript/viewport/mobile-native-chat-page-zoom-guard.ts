type ListenerTarget = {
  addEventListener: (
    type: string,
    listener: (event: Event) => void,
    options: { passive: boolean }
  ) => void
  removeEventListener: (type: string, listener: (event: Event) => void) => void
}

function isListenerTarget(node: unknown): node is ListenerTarget {
  return (
    typeof node === 'object' &&
    node !== null &&
    'addEventListener' in node &&
    typeof node.addEventListener === 'function' &&
    'removeEventListener' in node &&
    typeof node.removeEventListener === 'function'
  )
}

const cancel = (event: Event): void => {
  event.preventDefault()
}
// Pointer events still reach the gesture handler; only the browser's own zoom is refused.
const cancelMultiTouch = (event: Event): void => {
  const touches = 'touches' in event ? event.touches : null
  if (
    typeof touches === 'object' &&
    touches !== null &&
    'length' in touches &&
    typeof touches.length === 'number' &&
    touches.length > 1
  ) {
    event.preventDefault()
  }
}

/** WKWebView zooms the page on a pinch unless its touches are cancelled; touch-action alone does not
 * reach rows inside an overflow scroller there. Returns the undo. */
export function guardMobileNativeChatAgainstPageZoom(node: unknown): () => void {
  if (!isListenerTarget(node)) {
    return () => {}
  }
  const active = { passive: false }
  node.addEventListener('gesturestart', cancel, active)
  node.addEventListener('gesturechange', cancel, active)
  node.addEventListener('touchmove', cancelMultiTouch, active)
  return () => {
    node.removeEventListener('gesturestart', cancel)
    node.removeEventListener('gesturechange', cancel)
    node.removeEventListener('touchmove', cancelMultiTouch)
  }
}
