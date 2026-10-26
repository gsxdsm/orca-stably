import { View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronLeft, PanelLeftOpen } from 'lucide-react-native'
import { MobileSessionHeaderIconButton } from './MobileSessionHeaderIconButton'
import { MobileSessionPanelActions } from './MobileSessionPanelActions'
import { MobileSessionTabStrip } from './MobileSessionTabStrip'
import { StatusDot } from '../components/StatusDot'
import { styles } from './mobile-session-styles'
import { useHostSidebarReveal } from '../layout/host-sidebar-reveal'
import { useResponsiveLayout } from '../layout/responsive-layout'
import type { MobileSessionController } from './use-mobile-session-controller'

export function MobileSessionHeader({ controller }: { controller: MobileSessionController }) {
  const {
    hostId,
    isFolderWorkspaceRoute,
    isFloatingWorkspaceRoute,
    presentedConnState,
    forceReconnectHost,
    worktreeName,
    activePanel,
    setShowHeaderMoreActions,
    requestLeaveSession,
    visibleTabs,
    showConnectionRetry,
    terminalSummary,
    handlePanelTap,
    showHeaderMoreButton
  } = controller
  const revealSidebar = useHostSidebarReveal()
  // Folded, the status column (Dynamic Island, clock) runs down beside the header and tab rows.
  const { sessionSideRail, statusColumnWidth } = controller
  // Why: a sideways phone is ~390pt tall, so the tabs share the top bar instead of taking a second row.
  const hasTabs = visibleTabs.length > 0
  const tabsInTopBar = useResponsiveLayout().isLandscapePhone && hasTabs
  const tabStrip = hasTabs ? (
    <MobileSessionTabStrip controller={controller} inTopBar={tabsInTopBar} />
  ) : null
  return (
    <SafeAreaView
      style={[
        styles.sessionChrome,
        sessionSideRail === 'fullWidth' && { paddingRight: statusColumnWidth }
      ]}
      edges={['top']}
    >
      <View style={styles.sessionTopBar}>
        {revealSidebar ? (
          <MobileSessionHeaderIconButton
            accessibilityLabel="Show sidebar"
            icon={PanelLeftOpen}
            onPress={revealSidebar}
          />
        ) : null}
        <MobileSessionHeaderIconButton
          accessibilityLabel="Back to worktrees"
          icon={ChevronLeft}
          onPress={requestLeaveSession}
        />

        <View
          style={[styles.sessionTitleBlock, tabsInTopBar && styles.sessionTitleBlockBesideTabs]}
        >
          <Text style={styles.sessionTitle} numberOfLines={1}>
            {worktreeName || 'Terminal'}
          </Text>
          <Pressable
            style={styles.sessionMetaRow}
            disabled={!showConnectionRetry}
            onPress={() => {
              if (hostId && forceReconnectHost) {
                void forceReconnectHost(hostId)
              }
            }}
            accessibilityRole={showConnectionRetry ? 'button' : undefined}
            accessibilityLabel={showConnectionRetry ? 'Reconnect to desktop' : undefined}
          >
            <StatusDot state={presentedConnState} />
            <Text style={styles.sessionMetaText} numberOfLines={1}>
              {terminalSummary}
            </Text>
          </Pressable>
        </View>
        {tabsInTopBar ? tabStrip : null}
        {/* The side rail hosts these when the window has one (MobileSessionSideRail). */}
        {sessionSideRail === 'actions' ? null : (
          <MobileSessionPanelActions
            isFolderWorkspaceRoute={isFolderWorkspaceRoute}
            isFloatingWorkspaceRoute={isFloatingWorkspaceRoute}
            activePanel={activePanel}
            showHeaderMoreButton={showHeaderMoreButton}
            handlePanelTap={handlePanelTap}
            setShowHeaderMoreActions={setShowHeaderMoreActions}
          />
        )}
      </View>

      {tabsInTopBar ? null : tabStrip}
    </SafeAreaView>
  )
}
