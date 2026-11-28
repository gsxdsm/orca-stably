import { backSwipeCommits, backSwipeDirection, type InteractiveBackSwipe } from './back-swipe'

// Horizontal controls keep their input; the edge remains an escape from a full-screen terminal, but never from excluded chrome.
function reservesHorizontalInput(event: TouchEvent, edge: boolean): boolean {
  const path = event.composedPath()
  if (path.some((node) => node instanceof HTMLElement && node.dataset.backSwipe === 'disabled')) {
    return true
  }
  if (edge) {
    return false
  }
  if (document.getSelection()?.isCollapsed === false) {
    return true
  }
  return path.some((node) => {
    if (!(node instanceof HTMLElement)) {
      return false
    }
    if (
      node.matches(
        'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="slider"],canvas,iframe'
      )
    ) {
      return true
    }
    if (node.shadowRoot) {
      return true
    }
    const style = getComputedStyle(node)
    return /(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1
  })
}

export function listenForPageBackSwipe(
  page: Document,
  begin: (edge: boolean) => InteractiveBackSwipe | null
): () => void {
  let touch: {
    id: number
    x: number
    y: number
    lastX: number
    time: number
    started: number
    velocity: number
    width: number
  } | null = null
  let swipe: InteractiveBackSwipe | null = null
  let suppressClick = false
  let cancellingInput = false
  const cancel = () => {
    swipe?.cancel()
    swipe = null
    touch = null
  }
  const start = (event: TouchEvent) => {
    cancel()
    suppressClick = false
    if (event.touches.length !== 1) {
      return
    }
    const point = event.touches[0]
    if (reservesHorizontalInput(event, point.clientX <= 20)) {
      return
    }
    touch = {
      id: point.identifier,
      x: point.clientX,
      y: point.clientY,
      lastX: point.clientX,
      time: event.timeStamp,
      started: event.timeStamp,
      velocity: 0,
      width: page.documentElement.clientWidth
    }
  }
  const move = (event: TouchEvent) => {
    if (!touch) {
      return
    }
    if (event.touches.length !== 1 || !event.cancelable) {
      cancel()
      return
    }
    const point = Array.from(event.touches).find((point) => point.identifier === touch?.id)
    if (!point) {
      return
    }
    const dx = point.clientX - touch.x
    if (!swipe) {
      if (event.timeStamp - touch.started > 450) {
        cancel()
        return
      }
      const direction = backSwipeDirection(dx, point.clientY - touch.y)
      if (direction === 'wait') {
        return
      }
      if (direction === 'reject' || !(swipe = begin(touch.x <= 20))) {
        cancel()
        return
      }
      touch.width = swipe.width || touch.width
      cancellingInput = true
      event.composedPath()[0]?.dispatchEvent(
        new TouchEvent('touchcancel', {
          bubbles: true,
          composed: true,
          changedTouches: Array.from(event.touches)
        })
      )
      cancellingInput = false
    }
    const dt = event.timeStamp - touch.time
    if (dt > 0) {
      touch.velocity = (point.clientX - touch.lastX) / dt
    }
    touch.lastX = point.clientX
    touch.time = event.timeStamp
    event.preventDefault()
    event.stopImmediatePropagation()
    suppressClick = true
    swipe.update(Math.max(0, Math.min(1, dx / touch.width)))
  }
  const end = (event: TouchEvent) => {
    if (swipe && touch) {
      event.preventDefault()
      event.stopImmediatePropagation()
      const speed = event.timeStamp - touch.time > 100 ? 0 : touch.velocity
      const progress = Math.max(0, Math.min(1, (touch.lastX - touch.x) / touch.width))
      swipe.finish(backSwipeCommits(progress, speed))
    }
    swipe = null
    touch = null
  }
  const click = (event: MouseEvent) => {
    if (!suppressClick) {
      return
    }
    suppressClick = false
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const visibility = () => {
    if (page.hidden) {
      cancel()
    }
  }
  const touchCancel = () => {
    if (!cancellingInput) {
      cancel()
    }
  }
  const options = { capture: true, passive: false }
  page.addEventListener('touchstart', start, options)
  page.addEventListener('touchmove', move, options)
  page.addEventListener('touchend', end, options)
  page.addEventListener('touchcancel', touchCancel, true)
  page.addEventListener('click', click, true)
  page.addEventListener('visibilitychange', visibility)
  page.defaultView?.addEventListener('pagehide', cancel)
  page.defaultView?.addEventListener('resize', cancel)
  return () => {
    cancel()
    page.removeEventListener('touchstart', start, true)
    page.removeEventListener('touchmove', move, true)
    page.removeEventListener('touchend', end, true)
    page.removeEventListener('touchcancel', touchCancel, true)
    page.removeEventListener('click', click, true)
    page.removeEventListener('visibilitychange', visibility)
    page.defaultView?.removeEventListener('pagehide', cancel)
    page.defaultView?.removeEventListener('resize', cancel)
  }
}
