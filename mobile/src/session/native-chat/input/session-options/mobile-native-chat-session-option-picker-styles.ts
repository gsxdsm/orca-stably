import { spacing } from '../../../../theme/mobile-theme'
import { themedStyleSheet } from '../../../../theme/themed-styles'
import { COMPOSER_CONTROL_SIZE } from '../../../../components/composer-input/composer-input-styles'

export const sessionOptionPickerStylesSheet = themedStyleSheet(() => ({
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
  sheetFill: {
    flex: 1,
    minHeight: 0
  },
  header: {
    marginTop: -spacing.xs
  },
  pageTop: {
    height: spacing.sm
  }
}))
