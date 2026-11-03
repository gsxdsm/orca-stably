import type { ComponentType, Ref } from 'react'
import { Pressable, type View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { colors, feedback, radii } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { useSessionListLongPressProps } from '../../navigation/session-list-long-press-props'

export const NAV_BAR_BUTTON_SIZE = 36

type IconProps = { size?: number; color?: string; strokeWidth?: number }

type NavBarButtonProps = {
  ref?: Ref<View>
  icon: ComponentType<IconProps>
  accessibilityLabel: string
  onPress: () => void
  /** Replaces the session-list long press. Tap still uses onPress. */
  onLongPress?: () => void
  /** The screen or panel this button opens is showing. */
  active?: boolean
  disabled?: boolean
}

type LongPressProps = ReturnType<typeof useSessionListLongPressProps>

// A round top-bar button; the bar floats over content like the composer, so its buttons are round too.
export function NavBarButton(props: NavBarButtonProps) {
  if (props.icon === ChevronLeft || props.onLongPress) {
    return <SessionListNavBarButton {...props} />
  }
  return <NavBarButtonView {...props} />
}

function SessionListNavBarButton(props: NavBarButtonProps) {
  const longPress = useSessionListLongPressProps(props.onLongPress)
  return <NavBarButtonView {...props} longPress={longPress} />
}

function NavBarButtonView({
  ref,
  icon: Icon,
  accessibilityLabel,
  onPress,
  active = false,
  disabled = false,
  longPress
}: NavBarButtonProps & { longPress?: LongPressProps }) {
  useMobileColorScheme()
  return (
    <Pressable
      ref={ref}
      style={({ pressed }) => [
        styles.button,
        active && styles.active,
        pressed && styles.pressed,
        disabled && styles.disabled
      ]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      {...longPress}
    >
      <Icon size={18} color={active ? colors.bgBase : colors.textPrimary} strokeWidth={2.1} />
    </Pressable>
  )
}

const styles = themedStyleSheet(() => ({
  button: {
    width: NAV_BAR_BUTTON_SIZE,
    height: NAV_BAR_BUTTON_SIZE,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgRaised
  },
  active: {
    backgroundColor: colors.surfaceBright
  },
  pressed: {
    opacity: feedback.pressedOpacity
  },
  disabled: {
    opacity: feedback.disabledOpacity
  }
}))
