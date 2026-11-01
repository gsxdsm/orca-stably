import { ChevronLeft } from 'lucide-react-native'
import { View, useWindowDimensions } from 'react-native'
import { NavBarButton } from '../components/nav-bar/NavBarButton'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useReservedRegions } from '../layout/reserved-regions'
import { getSideRailStrip, type SideRailStrip } from '../layout/side-rail-strip'
import { useWindowSafeAreaInsets } from '../layout/side-safe-area'
import { spacing } from '../theme/mobile-theme'
import { duoRailBackVisible } from './duo-rail-back'
import { useDuoChatExpanded } from './duo-chat-width'

/**
 * Back sits at the top of the free status column. The cluster above that run is the system status,
 * and a collapsed chat still lays its composer across the bottom of the column.
 */
function slotStyle(strip: SideRailStrip) {
  return {
    position: 'absolute' as const,
    top: strip.top,
    height: strip.height,
    width: strip.width,
    alignItems: 'center' as const,
    paddingTop: spacing.sm,
    ...(strip.side === 'right' ? { right: 0 } : { left: 0 })
  }
}

export function DuoRailBackButton({
  chatVisible,
  onBack
}: {
  chatVisible: boolean
  onBack: () => void
}) {
  const t = useMobileTranslation()
  const expanded = useDuoChatExpanded()
  const { width, height } = useWindowDimensions()
  const insets = useWindowSafeAreaInsets()
  const { occlusions } = useReservedRegions()
  const strip = getSideRailStrip({
    windowWidth: width,
    windowHeight: height,
    insets,
    occlusions
  })
  if (!duoRailBackVisible({ chatVisible, expanded, strip }) || strip === null) {
    return null
  }
  return (
    <View pointerEvents="box-none" style={slotStyle(strip)}>
      <NavBarButton
        accessibilityLabel={t('session.header.backToWorktrees', 'Back to worktrees')}
        icon={ChevronLeft}
        onPress={onBack}
      />
    </View>
  )
}
