import { View, Text, StyleSheet, Pressable, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Bell,
  Wrench,
  Shield,
  LifeBuoy,
  Terminal as TerminalIcon
} from 'lucide-react-native'
import { spacing, typography, type ThemeColors } from '../src/theme/mobile-theme'
import { useTheme, useThemedStyles } from '../src/theme/theme-context'
import type { ThemePreference } from '../src/storage/preferences'

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors, preference, setPreference } = useTheme()
  const styles = useThemedStyles(createStyles)

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.heading}>Settings</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Appearance</Text>
          <View style={styles.segmentGroup}>
            {THEME_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.segment, preference === option.value && styles.segmentSelected]}
                onPress={() => setPreference(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: preference === option.value }}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    preference === option.value && styles.segmentLabelSelected
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.section, styles.sectionSpacer]}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/terminal-settings')}
        >
          <TerminalIcon size={16} color={colors.textSecondary} />
          <Text style={styles.rowLabel}>Terminal</Text>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/notifications')}
        >
          <Bell size={16} color={colors.textSecondary} />
          <Text style={styles.rowLabel}>Notifications</Text>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/troubleshoot')}
        >
          <Wrench size={16} color={colors.textSecondary} />
          <Text style={styles.rowLabel}>Troubleshooting</Text>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/about')}
        >
          <Info size={16} color={colors.textSecondary} />
          <Text style={styles.rowLabel}>About</Text>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={[styles.section, styles.sectionSpacer]}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => void Linking.openURL('https://www.onorca.dev/privacy')}
        >
          <Shield size={16} color={colors.textSecondary} />
          <Text style={styles.rowLabel}>Privacy Policy</Text>
        </Pressable>
        <View style={styles.separator} />
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => void Linking.openURL('https://github.com/stablyai/orca/issues')}
        >
          <LifeBuoy size={16} color={colors.textSecondary} />
          <Text style={styles.rowLabel}>Support</Text>
        </Pressable>
      </View>
    </View>
  )
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgBase,
      padding: spacing.lg
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xl
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm
    },
    heading: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary
    },
    section: {
      backgroundColor: colors.bgPanel,
      borderRadius: 12,
      overflow: 'hidden'
    },
    sectionSpacer: {
      marginTop: spacing.md
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md + 2
    },
    rowPressed: {
      backgroundColor: colors.bgRaised
    },
    rowLabel: {
      flex: 1,
      fontSize: typography.bodySize,
      fontWeight: '500',
      color: colors.textPrimary
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
      marginHorizontal: spacing.md
    },
    segmentGroup: {
      flexDirection: 'row',
      backgroundColor: colors.bgRaised,
      borderRadius: 8,
      padding: 2
    },
    segment: {
      paddingVertical: spacing.xs + 1,
      paddingHorizontal: spacing.md,
      borderRadius: 6
    },
    segmentSelected: {
      backgroundColor: colors.bgBase
    },
    segmentLabel: {
      fontSize: typography.metaSize,
      fontWeight: '500',
      color: colors.textSecondary
    },
    segmentLabelSelected: {
      color: colors.textPrimary
    }
  })
