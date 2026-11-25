import {
  mobileNativeChatRowAtPageY,
  type MobileNativeChatScrollNode
} from './mobile-native-chat-reading-place'

type PreviewNode = {
  style: { transform: string; transformOrigin: string; willChange: string }
  getBoundingClientRect: () => { top: number; left: number }
}

type Box = { top: number; bottom: number }
type Anchor = { row: { getBoundingClientRect: () => Box }; fraction: number; pageY: number }

// The innermost box under the point (a paragraph, not its whole message) rewraps closest to where it was.
function elementAtPage(
  scroller: MobileNativeChatScrollNode,
  x: number,
  y: number
): Omit<Anchor, 'pageY'> | undefined {
  const hit = typeof document === 'undefined' ? null : document.elementFromPoint(x, y)
  if (!hit || !('contains' in scroller) || typeof scroller.contains !== 'function') {
    return undefined
  }
  if (!scroller.contains(hit)) {
    return undefined
  }
  const box = hit.getBoundingClientRect()
  const height = box.bottom - box.top
  return { row: hit, fraction: height > 0 ? Math.min(1, Math.max(0, (y - box.top) / height)) : 0 }
}

// Web pinch preview: a compositor-only scale of the transcript, so a pinch never re-renders or relays out rows per frame.
export type MobileNativeChatPinchPreview = {
  /** Ref for the transcript box the preview scales; only DOM nodes (web) take part. */
  attach: (node: unknown) => void
  /** The transcript's scroller, read when a pinch ends to find the row under it. */
  bindScroller: (scroller: (() => MobileNativeChatScrollNode | null) | null) => void
  active: () => boolean
  begin: (focalX: number, focalY: number) => void
  scale: (ratio: number) => void
  /** Keep the preview up until the new size draws (`commit`), or drop it now. */
  release: (commit: boolean) => void
  /** Drops the preview; the returned reader says how far to scroll so the pinched point sits where it was. */
  settle: () => (() => number) | null
}

function isPreviewNode(node: unknown): node is PreviewNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    'style' in node &&
    'getBoundingClientRect' in node &&
    typeof node.getBoundingClientRect === 'function'
  )
}

export function createMobileNativeChatPinchPreview(): MobileNativeChatPinchPreview {
  let node: PreviewNode | null = null
  let scroller: (() => MobileNativeChatScrollNode | null) | null = null
  let pageX = 0
  let pageY: number | null = null
  let anchor: Anchor | null = null
  const clear = (): void => {
    if (node) {
      node.style.transform = ''
      node.style.transformOrigin = ''
      node.style.willChange = ''
    }
    pageY = null
  }
  return {
    attach: (next) => {
      node = isPreviewNode(next) ? next : null
    },
    bindScroller: (next) => {
      scroller = next
    },
    active: () => node !== null,
    begin: (focalX, focalY) => {
      if (!node) {
        return
      }
      clear()
      anchor = null
      // The origin is the one point a scale leaves in place; read it before any transform applies.
      const box = node.getBoundingClientRect()
      pageX = box.left + focalX
      pageY = box.top + focalY
      node.style.transformOrigin = `${focalX}px ${focalY}px`
      node.style.willChange = 'transform'
    },
    scale: (ratio) => {
      if (node && pageY !== null) {
        node.style.transform = `scale(${ratio})`
      }
    },
    release: (commit) => {
      const s = scroller?.()
      // The origin's content is the same under any scale, so the old layout can be read with the preview still up.
      const at =
        commit && s && pageY !== null
          ? (elementAtPage(s, pageX, pageY) ?? mobileNativeChatRowAtPageY(s, pageY))
          : undefined
      anchor = at && pageY !== null ? { ...at, pageY } : null
      if (!commit) {
        clear()
      }
    },
    settle: () => {
      const held = anchor
      anchor = null
      clear()
      // A row taken out by the rewrap has no place to put back.
      if (!held || ('isConnected' in held.row && held.row.isConnected === false)) {
        return null
      }
      return () => {
        const box = held.row.getBoundingClientRect()
        return box.top + held.fraction * (box.bottom - box.top) - held.pageY
      }
    }
  }
}
