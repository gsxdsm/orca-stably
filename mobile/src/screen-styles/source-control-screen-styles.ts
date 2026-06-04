// Theme style factory for the source control screen.
import { StyleSheet } from 'react-native'

import { radii, spacing, typography, type ThemeColors } from '../theme/mobile-theme'

export const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgBase
    },
    header: {
      backgroundColor: colors.bgPanel,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle
    },
    topBar: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.xs
    },
    backButtonPressed: {
      backgroundColor: colors.bgRaised
    },
    titleBlock: {
      flex: 1,
      minWidth: 0
    },
    title: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700'
    },
    meta: {
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      marginTop: 2
    },
    refreshButton: {
      width: 36,
      height: 36,
      borderRadius: radii.button,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: spacing.xs
    },
    refreshButtonPressed: {
      backgroundColor: colors.bgRaised
    },
    refreshButtonDisabled: {
      opacity: 0.45
    },
    summaryCard: {
      margin: spacing.lg,
      marginBottom: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.card,
      backgroundColor: colors.bgPanel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md
    },
    branchLine: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs
    },
    branchText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '600'
    },
    syncText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize
    },
    countRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.sm
    },
    countText: {
      color: colors.textSecondary,
      fontSize: typography.metaSize
    },
    conflictText: {
      color: colors.statusAmber,
      fontSize: typography.metaSize,
      textTransform: 'capitalize'
    },
    actionError: {
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.button,
      backgroundColor: colors.bgRaised,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.statusRed
    },
    actionErrorText: {
      color: colors.textPrimary,
      fontSize: typography.metaSize,
      lineHeight: 16
    },
    bulkRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md
    },
    bulkButton: {
      flex: 1,
      minHeight: 36,
      borderRadius: radii.button,
      backgroundColor: colors.bgRaised,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.xs
    },
    bulkMenuButton: {
      width: 42,
      minHeight: 36,
      borderRadius: radii.button,
      backgroundColor: colors.bgRaised,
      alignItems: 'center',
      justifyContent: 'center'
    },
    bulkButtonDisabled: {
      opacity: 0.45
    },
    bulkButtonPressed: {
      opacity: 0.75
    },
    bulkButtonText: {
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '600'
    },
    listContent: {
      paddingHorizontal: spacing.lg,
      paddingBottom: 136
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: spacing.md,
      paddingBottom: spacing.xs
    },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase'
    },
    sectionCount: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    branchCompareBlock: {
      paddingBottom: spacing.sm
    },
    branchSectionTitleBlock: {
      flex: 1,
      minWidth: 0
    },
    branchSectionSubtitle: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      marginTop: 2
    },
    branchStateRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle
    },
    branchStateText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: typography.metaSize,
      lineHeight: 18
    },
    fileRow: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle
    },
    fileRowPressed: {
      backgroundColor: colors.bgPanel
    },
    fileRowDisabled: {
      opacity: 0.78
    },
    fileRowUnavailable: {
      opacity: 0.72
    },
    statusBadge: {
      width: 24,
      alignItems: 'center'
    },
    statusBadgeText: {
      fontFamily: typography.monoFamily,
      fontSize: typography.metaSize,
      fontWeight: '700'
    },
    fileTextBlock: {
      flex: 1,
      minWidth: 0
    },
    filePath: {
      color: colors.textPrimary,
      fontSize: typography.bodySize
    },
    filePathDisabled: {
      color: colors.textSecondary
    },
    fileMeta: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      marginTop: 2
    },
    rowActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs
    },
    iconButton: {
      width: 32,
      height: 32,
      borderRadius: radii.button,
      alignItems: 'center',
      justifyContent: 'center'
    },
    iconButtonPressed: {
      backgroundColor: colors.bgRaised
    },
    iconButtonDisabled: {
      opacity: 0.45
    },
    commitBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      gap: spacing.xs,
      padding: spacing.lg,
      paddingTop: spacing.md,
      backgroundColor: colors.bgPanel,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle
    },
    commitRow: {
      flexDirection: 'row',
      gap: spacing.sm
    },
    commitInput: {
      flex: 1,
      minHeight: 42,
      borderRadius: radii.input,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.bgBase,
      color: colors.textPrimary,
      paddingHorizontal: spacing.md,
      fontSize: typography.bodySize
    },
    commitInputDisabled: {
      backgroundColor: colors.bgPanel,
      borderColor: colors.borderSubtle,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center'
    },
    commitInputDisabledText: {
      color: colors.textMuted,
      fontSize: typography.bodySize,
      fontWeight: '600'
    },
    commitButton: {
      minWidth: 88,
      minHeight: 42,
      borderRadius: radii.button,
      backgroundColor: colors.textPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md
    },
    commitButtonDisabled: {
      opacity: 0.45
    },
    commitButtonPressed: {
      opacity: 0.75
    },
    commitButtonText: {
      color: colors.bgBase,
      fontSize: typography.bodySize,
      fontWeight: '700'
    },
    state: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl
    },
    stateTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: spacing.xs
    },
    stateText: {
      color: colors.textSecondary,
      fontSize: typography.bodySize,
      lineHeight: 20,
      textAlign: 'center'
    },
    retryButton: {
      marginTop: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radii.button,
      backgroundColor: colors.bgRaised
    },
    retryText: {
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '600'
    },
    diffDrawerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle
    },
    diffDrawerTitleBlock: {
      flex: 1,
      minWidth: 0
    },
    diffDrawerTitle: {
      color: colors.textPrimary,
      fontSize: typography.bodySize,
      fontWeight: '700'
    },
    diffDrawerMeta: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      marginTop: 2
    },
    diffCloseButton: {
      width: 34,
      height: 34,
      borderRadius: radii.button,
      alignItems: 'center',
      justifyContent: 'center'
    },
    diffState: {
      minHeight: 160,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg
    },
    diffLines: {
      paddingTop: spacing.md,
      paddingBottom: spacing.lg
    },
    diffTruncatedText: {
      color: colors.textMuted,
      fontSize: typography.metaSize,
      marginBottom: spacing.sm
    },
    diffLine: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      paddingVertical: 2,
      paddingHorizontal: spacing.xs,
      borderRadius: radii.row
    },
    diffLineAdd: {
      backgroundColor: colors.diffAddedBg
    },
    diffLineDelete: {
      backgroundColor: colors.diffDeletedBg
    },
    diffLineNumber: {
      width: 40,
      color: colors.textMuted,
      fontFamily: typography.monoFamily,
      fontSize: typography.metaSize,
      textAlign: 'right'
    },
    diffLinePrefix: {
      width: 12,
      color: colors.textSecondary,
      fontFamily: typography.monoFamily,
      fontSize: typography.metaSize
    },
    diffLineText: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: typography.monoFamily,
      fontSize: typography.metaSize,
      lineHeight: 17
    }
  })
