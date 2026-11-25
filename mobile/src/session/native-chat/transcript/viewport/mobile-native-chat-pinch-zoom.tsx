import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode
} from 'react'
import { Platform, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import type { LegacyComposedGesture } from 'react-native-gesture-handler'
import {
  nativeChatFontScale,
  updateNativeChatTextSettings,
  useNativeChatTextSettingsFollowingShell
} from '../../preferences/native-chat-text-settings'
import {
  createMobileNativeChatPinchAnchor,
  type MobileNativeChatPinchAnchor
} from './mobile-native-chat-pinch-anchor'
import { nativeChatPinchCommitSize, nativeChatPinchLiveSize } from './mobile-native-chat-pinch-size'

// A pinch resizes the chat text live, then saves the whole-point size once on release for every chat.
// No CSS scale: a scaled transcript reads as the page zooming, not the text growing.
export function useMobileNativeChatPinchGesture(): {
  fontScale: number
  pinchGesture: LegacyComposedGesture
  pinchAnchor: MobileNativeChatPinchAnchor
} {
  const { size } = useNativeChatTextSettingsFollowingShell()
  const [pinched, setPinched] = useState<number | null>(null)
  const saved = useRef(size)
  useEffect(() => {
    saved.current = size
  }, [size])
  const live = useRef<number | null>(null)
  const pinchBase = useRef(size)
  const [preview] = useState(createMobileNativeChatPinchAnchor)
  const frame = useRef<number | null>(null)
  const dropFrame = (): void => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }
  // Web draws at most one size per frame, marking the text under the fingers just before it rewraps.
  const show = (next: number): void => {
    if (Platform.OS !== 'web') {
      setPinched(next)
      return
    }
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        if (live.current !== null) {
          preview.mark()
          setPinched(live.current)
        }
      })
    }
  }
  // Run callbacks on JS to access React state safely; simultaneous native scrolling keeps active lists from stealing pinch recognition.
  const pinchGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Native(),
        Gesture.Pinch()
          .runOnJS(true)
          .onStart((e) => {
            pinchBase.current = live.current ?? saved.current
            preview.begin(e.focalX, e.focalY)
          })
          .onUpdate((e) => {
            const next = nativeChatPinchLiveSize(pinchBase.current, e.scale, Platform.OS === 'web')
            if (next !== live.current) {
              live.current = next
              show(next)
            }
          })
          .onFinalize(() => {
            dropFrame()
            const next = nativeChatPinchCommitSize(live.current, saved.current)
            live.current = null
            if (next !== null) {
              preview.mark()
              void updateNativeChatTextSettings({ size: next })
            }
            preview.end()
            setPinched(null)
          })
      ),
    [preview]
  )
  useEffect(() => dropFrame, [])
  // The transcript takes the mark as it lays out the new size; drop one no size change drew.
  useLayoutEffect(() => {
    preview.settle()
  })

  return { fontScale: nativeChatFontScale(pinched ?? size), pinchGesture, pinchAnchor: preview }
}

// Web: gesture handler 3 defaults to touch-action: none (froze touch scrolling); auto would let a pinch zoom the page instead of the text.
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: valid CSS that the handler copies verbatim to style.touchAction; its union lists single keywords only.
const PAN_WITHOUT_PAGE_ZOOM = 'pan-x pan-y' as ComponentProps<typeof GestureDetector>['touchAction']

// Web: gesture handler 3 also cancels contextmenu by default, which drops Android WebView's Copy menu for selected text.
export function MobileNativeChatPinchZoom({
  gesture,
  preview,
  children
}: {
  gesture: LegacyComposedGesture
  preview?: MobileNativeChatPinchAnchor
  children: ReactNode
}) {
  return (
    <GestureDetector gesture={gesture} touchAction={PAN_WITHOUT_PAGE_ZOOM} enableContextMenu>
      {preview && Platform.OS === 'web' ? (
        // One known box to measure the pinch's focal point from.
        <View ref={preview.attach} style={PINCH_BOX}>
          {children}
        </View>
      ) : (
        children
      )}
    </GestureDetector>
  )
}

const PINCH_BOX = { flex: 1 } as const
