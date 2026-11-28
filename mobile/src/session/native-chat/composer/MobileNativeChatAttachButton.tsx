import { ActivityIndicator, Pressable } from 'react-native'
import { Plus } from 'lucide-react-native'
import { useMobileColors } from '../../../theme/use-mobile-color-scheme'
import { useThemedStyles } from '../../../theme/themed-styles'
import { composerInputStylesSheet as inputStylesSheet } from '../../../components/composer-input/composer-input-styles'

export function MobileNativeChatAttachButton({
  label,
  onPress,
  isAttaching,
  disabled
}: {
  label: string
  onPress: () => void
  isAttaching?: boolean
  disabled?: boolean
}): React.JSX.Element {
  const colors = useMobileColors()
  const inputStyles = useThemedStyles(inputStylesSheet)
  return (
    <Pressable
      accessibilityLabel={label}
      style={({ pressed }) => [inputStyles.controlButton, pressed && inputStyles.pressed]}
      onPress={onPress}
      disabled={isAttaching || disabled}
    >
      {isAttaching ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Plus size={19} color={colors.textPrimary} strokeWidth={2} />
      )}
    </Pressable>
  )
}
