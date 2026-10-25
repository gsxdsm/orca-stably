import { Pressable, StyleSheet, View } from 'react-native'
import { ChevronDown, Keyboard as KeyboardIcon } from 'lucide-react-native'
import { colors, spacing } from '../theme/mobile-theme'
import { styles as sessionStyles } from './mobile-session-styles'

// The accessory row's keyboard escape hatch, for key columns that replace that row.
export function MobileSessionDismissKeyboardKey({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [
        sessionStyles.accessoryKey,
        styles.key,
        pressed && sessionStyles.accessoryKeyPressed
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Dismiss keyboard"
    >
      <View style={sessionStyles.keyboardDismissGlyph}>
        <KeyboardIcon size={15} color={colors.textSecondary} strokeWidth={2} />
        <ChevronDown
          size={10}
          color={colors.textSecondary}
          strokeWidth={2.5}
          style={sessionStyles.keyboardDismissChevron}
        />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  key: {
    alignSelf: 'stretch',
    marginHorizontal: spacing.xs,
    paddingVertical: spacing.sm + 2,
    justifyContent: 'center'
  }
})
