// Theme style factory for MobileBrowserPane.
import { StyleSheet } from 'react-native'
import { radii, spacing, typography, type ThemeColors } from '../theme/mobile-theme'

export const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      minHeight: 0,
      backgroundColor: colors.bgBase
    },
    toolbar: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      backgroundColor: colors.bgPanel
    },
    toolbarIconButton: {
      width: 26,
      height: 26,
      borderRadius: radii.button,
      alignItems: 'center',
      justifyContent: 'center'
    },
    toolbarIconButtonPressed: {
      backgroundColor: colors.bgRaised
    },
    addressInput: {
      flex: 1,
      minWidth: 0,
      height: 28,
      borderRadius: radii.input,
      backgroundColor: colors.bgRaised,
      color: colors.textPrimary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 0,
      fontSize: 12,
      lineHeight: 16,
      includeFontPadding: false,
      textAlignVertical: 'center',
      fontFamily: typography.monoFamily
    },
    viewport: {
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
      backgroundColor: colors.bgBase
    },
    browserImageHost: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    },
    browserImageFill: {
      width: '100%',
      height: '100%'
    },
    browserImageLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center'
    },
    browserImageLayerHidden: {
      opacity: 0
    },
    browserZoomOffset: {
      alignItems: 'center',
      justifyContent: 'center'
    },
    browserFrameBox: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    },
    browserImage: {
      backgroundColor: colors.bgBase
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.sm,
      backgroundColor: 'rgba(13, 15, 24, 0.2)'
    },
    errorText: {
      color: colors.textPrimary,
      backgroundColor: colors.bgPanel,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: radii.button,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 13,
      textAlign: 'center',
      overflow: 'hidden'
    },
    dialogOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 30,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      backgroundColor: 'rgba(13, 15, 24, 0.5)'
    },
    dialogCard: {
      width: '100%',
      maxWidth: 360,
      borderRadius: radii.card,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      backgroundColor: colors.bgPanel,
      padding: spacing.lg
    },
    dialogTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600'
    },
    dialogMessage: {
      color: colors.textSecondary,
      fontSize: typography.bodySize,
      lineHeight: 20,
      marginTop: spacing.sm
    },
    dialogActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      marginTop: spacing.lg
    },
    dialogButton: {
      minHeight: 34,
      borderRadius: radii.button,
      backgroundColor: colors.bgRaised,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center'
    },
    dialogButtonPrimary: {
      backgroundColor: colors.textPrimary
    },
    dialogButtonPressed: {
      opacity: 0.75
    },
    dialogButtonText: {
      color: colors.textSecondary,
      fontSize: typography.bodySize,
      fontWeight: '600'
    },
    dialogButtonPrimaryText: {
      color: colors.bgBase
    },
    keyboardDock: {
      zIndex: 20,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
      backgroundColor: colors.bgPanel
    },
    keyRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.xs
    },
    keyButton: {
      minHeight: 30,
      minWidth: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.button,
      backgroundColor: colors.bgRaised,
      paddingHorizontal: spacing.sm
    },
    keyButtonPressed: {
      backgroundColor: colors.borderSubtle
    },
    keyButtonText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: typography.monoFamily
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xs + 2
    },
    keyboardInput: {
      flex: 1,
      height: 34,
      backgroundColor: colors.bgRaised,
      color: colors.textPrimary,
      borderRadius: radii.input,
      paddingHorizontal: spacing.md,
      fontSize: 14,
      fontFamily: typography.monoFamily,
      marginRight: spacing.sm
    },
    sendButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgRaised
    },
    disabled: {
      opacity: 0.35
    },
    disabledText: {
      color: colors.textMuted
    }
  })
