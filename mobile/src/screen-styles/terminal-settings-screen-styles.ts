// Theme style factory for the terminal-settings screen.
import { StyleSheet } from 'react-native'
import { radii, spacing, typography, type ThemeColors } from '../theme/mobile-theme'

export const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgBase,
      paddingHorizontal: spacing.lg,
      paddingTop: 0
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.lg
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
    scrollContent: {
      paddingBottom: spacing.xl
    },
    groupHeading: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.xs
    },
    groupTopGap: {
      marginTop: spacing.xl
    },
    groupDescription: {
      fontSize: typography.bodySize - 1,
      color: colors.textSecondary,
      lineHeight: 20,
      paddingHorizontal: spacing.xs
    },
    section: {
      backgroundColor: colors.bgPanel,
      borderRadius: radii.card,
      overflow: 'hidden'
    },
    sectionTopGap: {
      marginTop: spacing.sm
    },
    emptyText: {
      fontSize: typography.bodySize,
      color: colors.textSecondary,
      padding: spacing.md
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
    rowContent: {
      flex: 1
    },
    rowLabel: {
      fontSize: typography.bodySize,
      fontWeight: '500',
      color: colors.textPrimary
    },
    rowSublabel: {
      fontSize: typography.bodySize - 2,
      color: colors.textSecondary,
      marginTop: 2
    },
    keycap: {
      minWidth: 62,
      alignItems: 'center',
      backgroundColor: colors.bgRaised,
      borderRadius: radii.button,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs
    },
    keycapText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      fontFamily: typography.monoFamily
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
      marginHorizontal: spacing.md
    },
    stepperGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm
    },
    stepperButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgRaised
    },
    stepperButtonPressed: {
      backgroundColor: colors.borderSubtle
    },
    stepperButtonDisabled: {
      opacity: 0.4
    },
    stepperValue: {
      minWidth: 44,
      textAlign: 'center',
      fontSize: typography.bodySize,
      fontFamily: typography.monoFamily,
      color: colors.textPrimary
    },
    emptyContainer: {
      padding: spacing.md,
      alignItems: 'center',
      justifyContent: 'center'
    },
    deleteButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(239, 68, 68, 0.1)'
    },
    deleteButtonPressed: {
      backgroundColor: 'rgba(239, 68, 68, 0.2)'
    }
  })
