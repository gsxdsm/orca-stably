import { radii, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { LIST_ROW_PADDING } from '../components/list/ListGroup'

export const stylesSheet = themedStyleSheet((colors) => ({
  // A grouped page, as Settings and Edit computer are: sheetGroup groups on the grey page.
  container: {
    flex: 1,
    backgroundColor: colors.groupedPage
  },
  bar: { backgroundColor: colors.groupedPage },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm
  },
  groupNote: {
    fontSize: typography.metaSize,
    color: colors.textMuted,
    lineHeight: 18,
    paddingHorizontal: LIST_ROW_PADDING,
    paddingTop: spacing.sm
  },
  section: {
    marginBottom: spacing.xl
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  sectionHeading: {
    fontSize: typography.metaSize,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  card: {
    backgroundColor: colors.bgPanel,
    borderRadius: radii.surface,
    overflow: 'hidden'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2
  },
  rowMain: {
    flex: 1,
    gap: 4
  },
  rowTitle: {
    fontSize: typography.bodySize,
    fontWeight: '500',
    color: colors.textPrimary
  },
  rowSubtitle: {
    fontSize: typography.metaSize,
    color: colors.textSecondary
  },
  usageStack: {
    gap: spacing.sm,
    marginTop: 4
  },
  errorText: {
    fontSize: typography.metaSize,
    color: colors.statusRed
  },
  footerHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: LIST_ROW_PADDING,
    paddingTop: spacing.md
  },
  footerHintText: {
    flex: 1,
    fontSize: typography.metaSize,
    color: colors.textMuted,
    lineHeight: 18
  }
}))
