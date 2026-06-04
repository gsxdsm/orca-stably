// Theme style factory for the host (workspaces) screen.
import { StyleSheet } from 'react-native'

import { radii, spacing, typography, type ThemeColors } from '../theme/mobile-theme'

export const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgBase
    },
    topChrome: {
      backgroundColor: colors.bgPanel,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle
    },
    statusBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 34,
      paddingTop: spacing.xs,
      paddingHorizontal: spacing.lg
    },
    backButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.xs
    },
    hostIdentity: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      marginRight: spacing.md
    },
    hostNameText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary
    },
    reconnectButton: {
      paddingVertical: 4,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.button,
      backgroundColor: colors.bgPanel,
      borderWidth: 1,
      borderColor: colors.borderSubtle
    },
    reconnectButtonText: {
      color: colors.textPrimary,
      fontSize: typography.metaSize,
      fontWeight: '600'
    },
    authBanner: {
      backgroundColor: colors.bgPanel,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle
    },
    authBannerText: {
      color: colors.statusRed,
      fontSize: 13,
      marginBottom: spacing.sm
    },
    authActions: {
      flexDirection: 'row',
      gap: spacing.lg
    },
    authAction: {
      paddingVertical: spacing.xs
    },
    authActionText: {
      color: colors.accentBlue,
      fontSize: 13,
      fontWeight: '600'
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderSubtle
    },
    filterChipActive: {
      borderColor: colors.textSecondary,
      backgroundColor: colors.bgRaised
    },
    filterChipText: {
      fontSize: 12,
      color: colors.textSecondary
    },
    filterChipTextActive: {
      color: colors.textPrimary
    },
    sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs
    },
    groupButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs
    },
    sortLabel: {
      fontSize: 12,
      color: colors.textSecondary
    },
    toolbarSpacer: {
      flex: 1
    },
    newButton: {
      padding: spacing.xs
    },
    searchToggle: {
      padding: spacing.xs
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      gap: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      backgroundColor: colors.bgPanel
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 13,
      paddingVertical: 2
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center'
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: typography.bodySize
    },
    errorText: {
      color: colors.statusRed,
      fontSize: typography.bodySize
    },
    list: {
      paddingBottom: spacing.lg
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs
    },
    sectionIcon: {
      marginRight: spacing.xs
    },
    sectionRepoDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: spacing.xs
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5
    },
    sectionCount: {
      fontSize: 11,
      color: colors.textMuted,
      marginLeft: spacing.xs
    },
    separator: {
      height: 1,
      backgroundColor: colors.borderSubtle,
      marginLeft: spacing.lg + 24,
      marginRight: spacing.lg
    },
    worktreeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg
    },
    worktreeRowPressed: {
      backgroundColor: colors.bgRaised
    },
    indicatorCol: {
      width: 20,
      alignItems: 'center',
      paddingTop: 6,
      marginRight: spacing.sm,
      gap: 4
    },
    unreadBell: {
      marginTop: 2
    },
    worktreeMain: {
      flex: 1,
      marginRight: spacing.sm
    },
    worktreeNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm
    },
    worktreeName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
      flexShrink: 1
    },
    textReadOnly: {
      opacity: 0.5
    },
    prBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.bgRaised,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4
    },
    prNumber: {
      fontSize: 10,
      color: colors.textSecondary
    },
    worktreeMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
      gap: spacing.xs
    },
    repoDot: {
      width: 6,
      height: 6,
      borderRadius: 3
    },
    repoName: {
      fontSize: 11,
      color: colors.textSecondary,
      maxWidth: 100
    },
    branchName: {
      fontSize: 11,
      color: colors.textMuted,
      fontFamily: typography.monoFamily,
      flexShrink: 1
    },
    worktreePreview: {
      fontSize: 11,
      color: colors.textMuted,
      fontFamily: typography.monoFamily,
      marginTop: 2
    },
    terminalCount: {
      fontSize: typography.metaSize,
      color: colors.textMuted,
      minWidth: 16,
      textAlign: 'right',
      paddingTop: 3
    },
    filterModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xs,
      marginBottom: spacing.md
    },
    filterModalTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary
    },
    clearFiltersText: {
      fontSize: 13,
      color: colors.textSecondary
    },
    filterSectionLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.xs
    },
    filterGroup: {
      backgroundColor: colors.bgPanel,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: spacing.md
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md + 2,
      gap: spacing.sm
    },
    filterRowText: {
      flex: 1,
      fontSize: typography.bodySize,
      color: colors.textPrimary
    },
    filterSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
      marginHorizontal: spacing.md
    },
    filterRepoDot: {
      width: 8,
      height: 8,
      borderRadius: 4
    },
    confirmContent: {
      paddingBottom: spacing.lg
    },
    confirmTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary
    },
    confirmMessage: {
      fontSize: typography.bodySize,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      lineHeight: 20
    },
    confirmButtons: {
      flexDirection: 'row',
      gap: spacing.sm
    },
    confirmBtn: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      borderRadius: 10,
      alignItems: 'center'
    },
    confirmBtnCancel: {
      backgroundColor: colors.bgPanel
    },
    confirmBtnDestructive: {
      backgroundColor: colors.statusRed
    },
    confirmBtnPressed: {
      opacity: 0.7
    },
    confirmBtnCancelText: {
      fontSize: typography.bodySize,
      fontWeight: '600',
      color: colors.textSecondary
    },
    confirmBtnDestructiveText: {
      fontSize: typography.bodySize,
      fontWeight: '600',
      color: '#fff'
    }
  })
