import { ChevronLeft } from 'lucide-react-native'
import { View, useWindowDimensions } from 'react-native'
import { NavBarButton } from '../components/nav-bar/NavBarButton'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { duoRailBackFrame } from '../layout/duo-status-row'
import { useReservedRegions } from '../layout/reserved-regions'
import { getSideRailStrip } from '../layout/side-rail-strip'
import { useWindowSafeAreaInsets } from '../layout/side-safe-area'
import { duoRailBackVisible } from './duo-rail-back'
import { useDuoChatExpanded } from './duo-chat-width'

/**
 * Back shares the status row (battery, wifi, Control Center) and sits on the content edge of that
 * column, clear of the screen edge and camera. The free strip below stays open for the composer.
 */

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
  const frame = duoRailBackFrame({
    windowWidth: width,
    windowHeight: height,
    strip,
    occlusions
  })
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: frame.top,
        left: frame.left,
        width: frame.size,
        height: frame.size
      }}
    >
      <NavBarButton
        accessibilityLabel={t('session.header.backToWorktrees', 'Back to worktrees')}
        icon={ChevronLeft}
        onPress={onBack}
        size={frame.size}
      />
    </View>
  )
}
