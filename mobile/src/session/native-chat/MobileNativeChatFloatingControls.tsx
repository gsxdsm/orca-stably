import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native'
import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { SHEET_CURVE } from '../../components/sheet-motion-values'
import { useReducedMotionEnabled } from '../../platform/use-reduced-motion'
import { colors, feedback, radii } from '../../theme/mobile-theme'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { NATIVE_CHAT_FAB_GAP, NATIVE_CHAT_FAB_SIZE, styles } from './mobile-native-chat-view-styles'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import type { DuoRailControlFrame, DuoRailJumpFrames } from '../../layout/duo-status-row'

const FAB_LIFT = NATIVE_CHAT_FAB_SIZE + NATIVE_CHAT_FAB_GAP
const RAIL_ICON_STROKE = 2.1

function jumpEasing() {
  return Easing.bezier(...SHEET_CURVE)
}

const railButton = {
  borderRadius: radii.pill,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: colors.bgRaised
}

function useShown(shown: boolean): Animated.Value {
  const value = useRef(new Animated.Value(shown ? 1 : 0)).current
  const reducedMotion = useReducedMotionEnabled() === true
  useEffect(() => {
    if (reducedMotion) {
      value.setValue(shown ? 1 : 0)
      return
    }
    const animation = Animated.timing(value, {
      toValue: shown ? 1 : 0,
      duration: shown ? 160 : 120,
      easing: jumpEasing(),
      useNativeDriver: Platform.OS !== 'web'
    })
    animation.start()
    return () => animation.stop()
  }, [reducedMotion, shown, value])
  return value
}

function ChatJumpButton({
  shown,
  shownValue,
  bottom,
  frame,
  label,
  onPress,
  icon
}: {
  shown: boolean
  shownValue: Animated.Value
  bottom?: number | Animated.AnimatedInterpolation<number>
  frame?: {
    top: number | Animated.AnimatedInterpolation<number>
    left: number
    size: number
  }
  label: string
  onPress: () => void
  icon: ReactNode
}): React.JSX.Element {
  const reducedMotion = useReducedMotionEnabled() === true
  const scale = reducedMotion
    ? 1
    : shownValue.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] })
  return (
    <Animated.View
      pointerEvents={shown ? 'box-none' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={
        frame
          ? {
              position: 'absolute',
              top: frame.top,
              left: frame.left,
              width: frame.size,
              height: frame.size
            }
          : { position: 'absolute', right: 0, bottom }
      }
    >
      <Animated.View style={{ opacity: shownValue, transform: [{ scale }] }}>
        <Pressable
          accessibilityLabel={shown ? label : undefined}
          disabled={!shown}
          focusable={shown}
          style={({ pressed }) => [
            frame ? railButton : styles.fab,
            frame ? { width: frame.size, height: frame.size } : null,
            pressed && { opacity: feedback.pressedOpacity }
          ]}
          onPress={onPress}
        >
          {/* The glyph is not the control. A page click on the path never reaches onPress. */}
          <View collapsable={false} pointerEvents="none">
            {icon}
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

function railFrame(
  top: number | Animated.AnimatedInterpolation<number>,
  slot: DuoRailControlFrame
) {
  return { top, left: slot.left, size: slot.size }
}

export function MobileNativeChatFloatingControls({
  showJumpToTail,
  onJumpToTail,
  showPreviousMessage,
  onJumpToPrevious,
  rail
}: {
  showJumpToTail: boolean
  onJumpToTail: () => void
  showPreviousMessage: boolean
  onJumpToPrevious: (animated: boolean) => void
  rail?: DuoRailJumpFrames | null
}): React.JSX.Element {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const reducedMotion = useReducedMotionEnabled() === true
  const tailShown = useShown(showJumpToTail)
  const previousShown = useShown(showPreviousMessage)
  // Separate from the native-driver fade: `bottom` cannot run on the native driver.
  const tailLift = useRef(new Animated.Value(showJumpToTail ? 1 : 0)).current
  useEffect(() => {
    if (reducedMotion) {
      tailLift.setValue(showJumpToTail ? 1 : 0)
      return
    }
    const animation = Animated.timing(tailLift, {
      toValue: showJumpToTail ? 1 : 0,
      duration: showJumpToTail ? 160 : 120,
      easing: jumpEasing(),
      useNativeDriver: false
    })
    animation.start()
    return () => animation.stop()
  }, [reducedMotion, showJumpToTail, tailLift])
  const iconSize = rail ? rail.latest.size / 2 : 18
  const iconStroke = rail ? RAIL_ICON_STROKE : 2.2
  // Sit on the latest button while it is visible, then drop into its place when it hides.
  const previousBottom = tailLift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, FAB_LIFT]
  })
  const previousTop =
    rail === undefined || rail === null
      ? null
      : tailLift.interpolate({
          inputRange: [0, 1],
          outputRange: [rail.latest.top, rail.previous.top]
        })
  return (
    <View pointerEvents="box-none" style={rail ? StyleSheet.absoluteFill : styles.floatingControls}>
      <ChatJumpButton
        shown={showPreviousMessage}
        shownValue={previousShown}
        bottom={previousTop === null ? previousBottom : undefined}
        frame={
          previousTop === null || rail == null ? undefined : railFrame(previousTop, rail.previous)
        }
        label={t('session.nativeChatFloatingControls.previousMessage', 'Previous message')}
        onPress={() => onJumpToPrevious(!reducedMotion)}
        icon={<ArrowUp size={iconSize} color={colors.textPrimary} strokeWidth={iconStroke} />}
      />
      <ChatJumpButton
        shown={showJumpToTail}
        shownValue={tailShown}
        bottom={rail ? undefined : 0}
        frame={rail ? railFrame(rail.latest.top, rail.latest) : undefined}
        label={t('session.nativeChatFloatingControls.scrollToLatest', 'Scroll to latest')}
        onPress={onJumpToTail}
        icon={<ArrowDown size={iconSize} color={colors.textPrimary} strokeWidth={iconStroke} />}
      />
    </View>
  )
}
