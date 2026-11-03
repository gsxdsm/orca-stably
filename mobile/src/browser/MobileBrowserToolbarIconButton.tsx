import { Pressable, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { colors, radii } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useSessionListLongPressProps } from '../navigation/session-list-long-press-props'

type Props = {
  children: ReactNode
  disabled?: boolean
  label: string
  onPress: () => void
  style?: StyleProp<ViewStyle>
  toSessionList?: boolean
}

export function MobileBrowserToolbarIconButton({
  children,
  disabled,
  label,
  onPress,
  style,
  toSessionList = false
}: Props): React.JSX.Element {
  useMobileColorScheme()
  const sessionListLongPress = useSessionListLongPressProps()
  // A disabled Pressable drops onLongPress, so empty history still accepts the session-list hold.
  const keepLongPress =
    disabled === true && toSessionList && sessionListLongPress.onLongPress != null
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        style,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.disabled
      ]}
      disabled={disabled === true && !keepLongPress}
      onPress={disabled ? undefined : onPress}
      accessibilityLabel={label}
      {...(toSessionList ? sessionListLongPress : {})}
    >
      {children}
    </Pressable>
  )
}

const styles = themedStyleSheet(() => ({
  button: {
    width: 26,
    height: 26,
    borderRadius: radii.control,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonPressed: {
    backgroundColor: colors.bgRaised
  },
  disabled: {
    opacity: 0.35
  }
}))
