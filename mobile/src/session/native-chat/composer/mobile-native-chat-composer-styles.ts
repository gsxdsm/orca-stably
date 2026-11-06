import { spacing } from '../../../theme/mobile-theme'
import { themedStyleSheet } from '../../../theme/themed-styles'
import { composerInputStyles } from '../../../components/composer-input/composer-input-styles'

/** Space above the composer box; the queue box above reaches through it. */
export const COMPOSER_INSET_TOP = 6
/** How far a box docked on the composer's top edge reaches under it, past its rounded corners. */
export const COMPOSER_TUCK = 12

const composerInset = {
  paddingHorizontal: spacing.md,
  paddingTop: COMPOSER_INSET_TOP,
  paddingBottom: spacing.sm
}

export const mobileNativeChatComposerStyles = themedStyleSheet(() => ({
  composerInset,
  // Bottom margin matches the sides, so the box sits evenly in the screen's corners.
  composerInsetCornerFit: { ...composerInset, paddingBottom: 10 },
  bar: { ...composerInputStyles.box, ...composerInputStyles.docked },
  // Wider bottom corners stay concentric with the rounded screen instead of poking into it.
  barCornerFit: {
    ...composerInputStyles.box,
    ...composerInputStyles.docked,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    paddingBottom: 14
  },
  leadingControls: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm
  },
  dictationMeter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flexGrow: 6,
    flexShrink: 0
  }
}))
