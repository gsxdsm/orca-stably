import { colors, spacing, typography } from '../../../../theme/mobile-theme'
import { themedStyleSheet } from '../../../../theme/themed-styles'
import { LIST_ROW_PADDING } from '../../../../components/list/ListGroup'
import { COMPOSER_CONTROL_SIZE } from '../../../../components/composer-input/composer-input-styles'

export const sessionOptionPickerStyles = themedStyleSheet(() => ({
  // Far above the usage meter's 1, so a long label truncates before the meter gives way.
  pillSlot: {
    flexShrink: 100,
    minWidth: 0
  },
  // A labelled pill keeps its icon and a few letters.
  labelledPillSlot: {
    minWidth: 2 * COMPOSER_CONTROL_SIZE
  },
  sheet: {
    paddingBottom: spacing.xs
  },
  header: {
    marginTop: -spacing.xs
  },
  pageTop: {
    height: spacing.sm
  },
  lockNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: LIST_ROW_PADDING,
    paddingVertical: spacing.sm
  },
  lockNoticeBody: {
    flex: 1,
    gap: 2
  },
  lockNoticeTitle: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600'
  },
  lockNoticeDescription: {
    color: colors.textSecondary,
    fontSize: typography.metaSize
  }
}))
