import { useCallback, useEffect, useRef, useState } from 'react'
import type { LayoutChangeEvent, View } from 'react-native'
import { foldPosture } from './fold-division'
import { useFoldDivision } from './use-window-regions'

export type StackedFoldBand = {
  /** Attach to the view the band is measured against. */
  readonly ref: React.RefObject<View | null>
  readonly onLayout: (event: LayoutChangeEvent) => void
  /** The hinge's top edge in the view's own coordinates; null when flat, side by side, or outside it. */
  readonly top: number | null
  /** The view's height, for content that ends at `top`. */
  readonly height: number
}

/** Where a laptop-style hinge crosses a view, so its content can stop above the fold. */
export function useStackedFoldBand(): StackedFoldBand {
  const posture = foldPosture(useFoldDivision())
  const hingeTop = posture.kind === 'stacked' ? posture.topEnd : null
  const ref = useRef<View>(null)
  const [frame, setFrame] = useState<{ y: number; height: number } | null>(null)
  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _width, height) => setFrame({ y, height }))
  }, [])
  // Folding moves the hinge without resizing the view, so measure on a posture change too.
  useEffect(() => {
    if (hingeTop !== null) {
      measure()
    }
  }, [hingeTop, measure])
  const onLayout = useCallback(() => {
    if (hingeTop !== null) {
      measure()
    }
  }, [hingeTop, measure])
  const top =
    hingeTop !== null && frame !== null && hingeTop > frame.y && hingeTop < frame.y + frame.height
      ? hingeTop - frame.y
      : null
  return { ref, onLayout, top, height: frame?.height ?? 0 }
}
