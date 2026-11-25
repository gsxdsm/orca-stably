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
  NATIVE_CHAT_TEXT_SIZE_MAX,
  NATIVE_CHAT_TEXT_SIZE_MIN,
  clampNativeChatTextSize,
  nativeChatFontScale,
  updateNativeChatTextSettings,
  useNativeChatTextSettingsFollowingShell
} from '../../preferences/native-chat-text-settings'
import {
  createMobileNativeChatPinchPreview,
  type MobileNativeChatPinchPreview
} from './mobile-native-chat-pinch-preview'

// A pinch previews, then saves the whole-point size once on release for every chat.
// Web previews with a compositor scale and rewraps once; native steps whole points, since
// frame-level scales would repaint recycled iOS paragraphs with stale clipped content.
export function useMobileNativeChatPinchGesture(): {
  fontScale: number
  pinchGesture: LegacyComposedGesture
  pinchPreview: MobileNativeChatPinchPreview
} {
  const { size } = useNativeChatTextSettingsFollowingShell()
  const [pinched, setPinched] = useState<number | null>(null)
  const saved = useRef(size)
  useEffect(() => {
    saved.current = size
  }, [size])
  const live = useRef<number | null>(null)
  const pinchBase = useRef(size)
  const [preview] = useState(createMobileNativeChatPinchPreview)
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
            const exact = Math.min(
              NATIVE_CHAT_TEXT_SIZE_MAX,
              Math.max(NATIVE_CHAT_TEXT_SIZE_MIN, pinchBase.current * e.scale)
            )
            live.current = clampNativeChatTextSize(exact)
            if (preview.active()) {
              preview.scale(exact / saved.current)
            } else {
              setPinched(live.current)
            }
          })
          .onFinalize(() => {
            const next = live.current
            live.current = null
            const changed = next !== null && next !== saved.current
            preview.release(changed)
            if (changed) {
              void updateNativeChatTextSettings({ size: next })
            }
            setPinched(null)
          })
      ),
    [preview]
  )
  // The transcript settles the preview as it lays out the new size; drop any it never drew.
  useLayoutEffect(() => {
    preview.settle()
  }, [preview, size])

  return { fontScale: nativeChatFontScale(pinched ?? size), pinchGesture, pinchPreview: preview }
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
  preview?: MobileNativeChatPinchPreview
  children: ReactNode
}) {
  return (
    <GestureDetector gesture={gesture} touchAction={PAN_WITHOUT_PAGE_ZOOM} enableContextMenu>
      {preview && Platform.OS === 'web' ? (
        // The outer box clips the scaled preview to the transcript's own area.
        <View style={PREVIEW_CLIP}>
          <View ref={preview.attach} style={PREVIEW_FILL}>
            {children}
          </View>
        </View>
      ) : (
        children
      )}
    </GestureDetector>
  )
}

const PREVIEW_CLIP = { flex: 1, overflow: 'hidden' } as const
const PREVIEW_FILL = { flex: 1 } as const
