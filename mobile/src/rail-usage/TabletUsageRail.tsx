import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PanelRightClose, PanelRightOpen } from 'lucide-react-native'
import { useAccountsSnapshot } from '../composer-usage/accounts-snapshot-store'
import { composerInputStyles } from '../components/composer-input/composer-input-styles'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { DUO_STATUS_RING_DIAMETER } from '../layout/duo-status-row'
import { useReservedRegions } from '../layout/reserved-regions'
import { useResponsiveLayout } from '../layout/responsive-layout'
import { useSideRailStrip } from '../layout/side-rail'
import { colors, spacing } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useHostClient } from '../transport/connection/host-client-hooks'
import { listRailUsage } from './rail-usage-model'
import { RailUsageStack } from './RailUsageStack'
import {
  setTabletUsageRailExpanded,
  useTabletUsageRailExpanded
} from './tablet-usage-rail-preference'

/** A wide window with no Duo status column to put the rings in, like an iPad's. */
export function useTabletUsageRailRoom(): boolean {
  const { isWideLayout } = useResponsiveLayout()
  const strip = useSideRailStrip()
  const { hasFoldDivision } = useReservedRegions()
  return isWideLayout && strip === null && hasFoldDivision !== true
}

/** The Duo rail's usage rings in a right-hand column beside the page, folded to its toggle on request. */
export function TabletUsageRail({ hostId }: { hostId: string }): React.JSX.Element | null {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const insets = useSafeAreaInsets()
  const { client } = useHostClient(hostId)
  const snapshot = useAccountsSnapshot(client)
  const expanded = useTabletUsageRailExpanded()
  if (listRailUsage(snapshot).length === 0) {
    return null
  }
  const Icon = expanded ? PanelRightClose : PanelRightOpen
  return (
    <View
      style={[
        styles.rail,
        expanded && styles.expanded,
        {
          paddingTop: insets.top + spacing.sm,
          paddingBottom: insets.bottom,
          paddingRight: insets.right
        }
      ]}
      testID="tablet-usage-rail"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          expanded
            ? t('tabletUsageRail.collapse', 'Hide usage rail')
            : t('tabletUsageRail.expand', 'Show usage rail')
        }
        accessibilityState={{ expanded }}
        hitSlop={6}
        onPress={() => setTabletUsageRailExpanded(!expanded)}
        style={({ pressed }) => [
          composerInputStyles.ghostButton,
          pressed && composerInputStyles.pressed
        ]}
        testID="tablet-usage-rail-toggle"
      >
        <Icon size={18} color={colors.textSecondary} strokeWidth={2} />
      </Pressable>
      {expanded ? <RailUsageStack snapshot={snapshot} standalone /> : null}
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  rail: {
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSubtle,
    backgroundColor: colors.bgBase
  },
  // Room for a ring and the percent label that overhangs its sides.
  expanded: {
    width: DUO_STATUS_RING_DIAMETER + spacing.lg * 2
  }
}))
