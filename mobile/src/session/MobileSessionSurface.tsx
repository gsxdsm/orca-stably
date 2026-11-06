import { useContext, type ComponentProps } from 'react'
import { Text, View } from 'react-native'
import { styles } from './mobile-session-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import type { MobileSessionController } from './use-mobile-session-controller'
import { MobileSessionContentRow } from './MobileSessionContentRow'
import { MobileSessionHeader } from './MobileSessionHeader'
import { MobileSessionSheets } from './MobileSessionSheets'
import { MobileWorkerAutoCloseStrip } from './MobileWorkerAutoCloseStrip'
import { AnchoredDetailCardLayer } from '../components/AnchoredDetailCard'
import { StatusDot } from '../components/StatusDot'
import { useResponsiveLayout } from '../layout/responsive-layout'
import { WorkspaceServerContext } from '../transport/workspace-server-context'
import { useSessionTitleCard } from './use-session-title-card'
import { useDetailCardScope } from '../components/use-detail-card-scope'
import { useShellSideRail } from '../layout/use-shell-side-rail'
import { SessionListLongPressOverride } from '../navigation/session-list-long-press-context'
import { useReleasedSideInset } from '../layout/released-side-inset'
import { sideStripPadding } from './session-side-strip-inset'
import { DuoRailBackButton } from './DuoRailBackButton'
import { DuoRailJumpHost, DuoRailJumpOverlay } from './duo-rail-jump-controls'
import { useKeyboardOcclusion } from '../platform/keyboard-occlusion'
import { useSessionRailBack } from './use-duo-rail-back'

// Read the keyboard here, so a keyboard change re-renders only these shells and not the whole session.
function KeyboardDuoRailJumpHost(
  props: Omit<ComponentProps<typeof DuoRailJumpHost>, 'keyboardInset'>
) {
  return <DuoRailJumpHost {...props} keyboardInset={useKeyboardOcclusion()} />
}

function KeyboardDuoRailBackButton(
  props: Omit<ComponentProps<typeof DuoRailBackButton>, 'keyboardInset'>
) {
  return <DuoRailBackButton {...props} keyboardInset={useKeyboardOcclusion()} />
}

export function MobileSessionSurface({ controller }: { controller: MobileSessionController }) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { setMobileSessionRootRef } = controller
  const server = useContext(WorkspaceServerContext)
  const layout = useResponsiveLayout()
  const sideRail = useShellSideRail()
  const releasedStrip = useReleasedSideInset()
  const hasTabs = controller.visibleTabs.length > 0
  const besideTabs = (layout.isLandscapePhone || sideRail) && hasTabs
  const titleVisible =
    !sideRail || !hasTabs || controller.showConnectionRetry || controller.connectionEscalated
  // The compact Duo header removes the opener, so its card must yield with it.
  const obscured = Boolean(
    !titleVisible ||
    controller.showHeaderMoreActions ||
    controller.showCreateTabDrawer ||
    controller.showTerminalLayout ||
    (controller.showQuickCommands && controller.quickCommandsSupported === true) ||
    controller.pendingDiffNotesDelivery != null ||
    controller.actionTarget != null ||
    controller.markdownActionTarget != null ||
    controller.fileActionTarget != null ||
    controller.browserActionTarget != null ||
    controller.agentSessionActionTarget != null ||
    controller.bulkCloseConfirm.visible ||
    controller.leaveDrafts != null ||
    controller.discardMarkdownTarget != null ||
    controller.renameTarget != null ||
    controller.showCreateBrowserModal ||
    controller.showCustomKeyModal ||
    controller.showDictationSetup ||
    controller.deleteKeyTarget != null
  )
  const details = useSessionTitleCard(besideTabs, obscured)
  useDetailCardScope({ ...details, obscured })
  // Only a proven local record belongs to this route's desktop or server.
  const hostName =
    controller.worktreeHostId === 'local' ? (server ? server.name : controller.hostName) : null
  const onRailBack = useSessionRailBack(() => {
    if (!details.closeFirst()) {
      controller.requestLeaveSession()
    }
  })
  return (
    <KeyboardDuoRailJumpHost chatVisible={controller.showNativeChat}>
      <SessionListLongPressOverride action={controller.requestLeaveToSessionList}>
        <View ref={setMobileSessionRootRef} style={styles.container}>
          <View style={styles.kavInner}>
            <MobileSessionHeader controller={controller} details={details} />
            <View style={sideStripPadding(releasedStrip)}>
              <MobileWorkerAutoCloseStrip controller={controller} />
            </View>
            <MobileSessionContentRow controller={controller} />
          </View>
          <KeyboardDuoRailBackButton chatVisible={controller.showNativeChat} onBack={onRailBack} />
          <DuoRailJumpOverlay />
          <AnchoredDetailCardLayer
            card={details}
            obscured={obscured}
            title={controller.worktreeName || t('session.header.terminalTitle', 'Terminal')}
            detail={controller.worktreePath}
            footer={
              hostName ? (
                <>
                  <StatusDot state={controller.connState} />
                  <Text style={styles.sessionMetaText}>{hostName}</Text>
                </>
              ) : null
            }
          />
          <MobileSessionSheets controller={controller} />
        </View>
      </SessionListLongPressOverride>
    </KeyboardDuoRailJumpHost>
  )
}
