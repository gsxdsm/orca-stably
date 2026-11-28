import { ChevronDown, ChevronRight, GitBranch } from 'lucide-react-native'
import { Pressable, Text } from 'react-native'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { useThemedStyles } from '../../theme/themed-styles'
import { useMobileColors } from '../../theme/use-mobile-color-scheme'
import { worktreeListRowStylesSheet } from './worktree-list-row-styles'

// Grows the 20 pt pill to a 44 pt target without pushing the row apart.
const LINEAGE_TOGGLE_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 } as const

export function WorktreeLineageToggle({
  count,
  collapsed,
  onPress
}: {
  count: number
  collapsed: boolean
  onPress: () => void
}) {
  const t = useMobileTranslation()
  const colors = useMobileColors()
  const styles = useThemedStyles(worktreeListRowStylesSheet)

  return (
    <Pressable
      style={({ pressed }) => [styles.lineageToggle, pressed && styles.lineageTogglePressed]}
      hitSlop={LINEAGE_TOGGLE_HIT_SLOP}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      onPress={(event) => {
        event.stopPropagation()
        onPress()
      }}
    >
      {collapsed ? (
        <ChevronRight size={12} color={colors.textSecondary} />
      ) : (
        <ChevronDown size={12} color={colors.textSecondary} />
      )}
      <GitBranch size={12} color={colors.textSecondary} />
      <Text style={styles.lineageToggleText}>
        {count === 1
          ? t('components.worktreeListRow.children_one', '{{count}} child', { count })
          : t('components.worktreeListRow.children_other', '{{count}} children', { count })}
      </Text>
    </Pressable>
  )
}
