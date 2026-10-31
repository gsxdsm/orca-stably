import { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { RuntimeWorktreeAgentRow } from '../../../src/shared/runtime-types'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { sidebarSessionJumps } from './sidebar-session-jumps'

const INDENT_PER_DEPTH = 14
const LIST_MAX_HEIGHT = 240

type Props = {
  agents: readonly RuntimeWorktreeAgentRow[] | undefined
  now: number
  onJump: (paneKey: string) => void
}

export function WorkspaceSessionJumpList({ agents, now, onJump }: Props) {
  const t = useMobileTranslation()
  useMobileColorScheme()
  const jumps = useMemo(() => sidebarSessionJumps(agents, now), [agents, now])
  if (jumps.length === 0) {
    return null
  }
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t('hostScreen.hostScreenOverlays.sessions', 'Sessions')}</Text>
      <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {jumps.map((jump, index) => (
          <View key={jump.paneKey}>
            {index > 0 ? <View style={styles.separator} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('hostScreen.hostScreenOverlays.openSession', 'Open {{name}}', {
                name: jump.label
              })}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onJump(jump.paneKey)}
            >
              <Text
                style={[styles.label, { paddingLeft: jump.depth * INDENT_PER_DEPTH }]}
                numberOfLines={2}
              >
                {jump.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  section: {
    marginBottom: spacing.md
  },
  heading: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm
  },
  list: {
    maxHeight: LIST_MAX_HEIGHT,
    backgroundColor: colors.sheetGroup,
    borderRadius: radii.surface
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: spacing.md
  },
  row: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md + 2
  },
  rowPressed: {
    backgroundColor: colors.borderSubtle
  },
  label: {
    fontSize: typography.bodySize,
    fontWeight: '500',
    color: colors.textPrimary
  }
}))
