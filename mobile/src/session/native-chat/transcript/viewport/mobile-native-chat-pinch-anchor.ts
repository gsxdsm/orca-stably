import {
  mobileNativeChatRowAtPageY,
  type MobileNativeChatScrollNode
} from './mobile-native-chat-reading-place'

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

// Web pinch anchor: the text under the fingers stays put as each live text size rewraps the transcript.
export type MobileNativeChatPinchAnchor = {
  /** Ref for the transcript box the pinch's focal point is measured from; only DOM nodes (web) take part. */
  attach: (node: unknown) => void
  /** The transcript's scroller, read before each resize to find the text under the pinch. */
  bindScroller: (scroller: (() => MobileNativeChatScrollNode | null) | null) => void
  begin: (focalX: number, focalY: number) => void
  /** Reads the point under the pinch from the current layout; call just before a new size renders. */
  mark: () => void
  end: () => void
  /** Takes the mark; the returned reader says how far to scroll so the pinched point sits where it was. */
  settle: () => (() => number) | null
}

type BoxNode = { getBoundingClientRect: () => { top: number; left: number } }

function isBoxNode(node: unknown): node is BoxNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    'getBoundingClientRect' in node &&
    typeof node.getBoundingClientRect === 'function'
  )
}

export function createMobileNativeChatPinchAnchor(): MobileNativeChatPinchAnchor {
  let node: BoxNode | null = null
  let scroller: (() => MobileNativeChatScrollNode | null) | null = null
  let pageX = 0
  let pageY: number | null = null
  let anchor: Anchor | null = null
  return {
    attach: (next) => {
      node = isBoxNode(next) ? next : null
    },
    bindScroller: (next) => {
      scroller = next
    },
    begin: (focalX, focalY) => {
      anchor = null
      if (!node) {
        pageY = null
        return
      }
      const box = node.getBoundingClientRect()
      pageX = box.left + focalX
      pageY = box.top + focalY
    },
    mark: () => {
      const s = scroller?.()
      const at =
        s && pageY !== null
          ? (elementAtPage(s, pageX, pageY) ?? mobileNativeChatRowAtPageY(s, pageY))
          : undefined
      anchor = at && pageY !== null ? { ...at, pageY } : null
    },
    end: () => {
      pageY = null
    },
    settle: () => {
      const held = anchor
      anchor = null
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
