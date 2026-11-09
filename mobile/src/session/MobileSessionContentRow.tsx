import { View, Text, Pressable } from 'react-native'
import { AlertTriangle, X } from 'lucide-react-native'
import { SessionDockColumn } from './SessionDockColumn'
import { dismissMobileSessionCreateWarningState } from './tabs/mobile-session-create-warning-state'
import { colors, pressedStyle } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { styles } from './mobile-session-styles'
import type { MobileSessionController } from './use-mobile-session-controller'
import { MobileSessionActiveContent } from './MobileSessionActiveContent'
import { MobileSessionCommandDock } from './MobileSessionCommandDock'
import { MobileDictationStatusAnnouncement } from '../dictation/MobileDictationStatusAnnouncement'
import {
  ComposerUsageClientContext,
  ComposerUsageTabAgentContext
} from '../composer-usage/composer-usage-client-context'
import { getMobileTerminalTabHostAgentIdentity } from '../terminal/session/mobile-terminal-tab-agent'
import {
  sideStripMargin,
  sideStripPadding,
  useSessionSideStripInset
} from './session-side-strip-inset'
import { MobileDictationLiveContext } from '../dictation/mobile-dictation-live-context'
import { useMobileDictationLive } from '../dictation/use-mobile-dictation-live'

export function MobileSessionContentRow({ controller }: { controller: MobileSessionController }) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const {
    hostId,
    worktreeId,
    worktreeName,
    activePanel,
    setActivePanel,
    sessionContentRowWidth,
    canDockPanel,
    setCreateWarningState,
    createWarning,
    dictation,
    cancelDictation,
    handleSessionContentRowLayout,
    client,
    connState
  } = controller
  const dictationLive = useMobileDictationLive(dictation, cancelDictation, hostId)
  const tabAgent =
    (controller.activeSessionTab &&
      getMobileTerminalTabHostAgentIdentity(controller.activeSessionTab, controller.terminals)) ??
    null
  const strip = useSessionSideStripInset(canDockPanel && activePanel !== null)
  return (
    <View
      style={[styles.sessionContentRow, sideStripPadding(strip.row)]}
      onLayout={handleSessionContentRowLayout}
    >
      <View style={styles.sessionContentMain}>
        {createWarning ? (
          <View style={[styles.createWarningBanner, sideStripMargin(strip.main)]}>
            <AlertTriangle size={16} color={colors.statusAmber} strokeWidth={2.2} />
            <Text style={styles.createWarningText}>{createWarning}</Text>
            <Pressable
              style={({ pressed }) => [styles.createWarningDismiss, pressed && pressedStyle]}
              onPress={() => setCreateWarningState(dismissMobileSessionCreateWarningState)}
              accessibilityLabel={t(
                'session.contentRow.dismissCreationWarning',
                'Dismiss workspace creation warning'
              )}
              hitSlop={8}
            >
              <X size={16} color={colors.textMuted} strokeWidth={2.2} />
            </Pressable>
          </View>
        ) : null}
        <ComposerUsageClientContext.Provider value={connState === 'connected' ? client : null}>
          <ComposerUsageTabAgentContext.Provider value={tabAgent}>
            <MobileDictationLiveContext.Provider value={dictationLive}>
              <MobileSessionActiveContent controller={controller} />
              {/* Why: translate instead of resize so keyboard toggles don't trigger a server-side PTY viewport change. */}
              <View style={sideStripMargin(strip.main)}>
                <MobileSessionCommandDock controller={controller} />
              </View>
            </MobileDictationLiveContext.Provider>
          </ComposerUsageTabAgentContext.Provider>
        </ComposerUsageClientContext.Provider>
        <MobileDictationStatusAnnouncement dictation={dictation} />
      </View>
      {canDockPanel && activePanel !== null && (
        <SessionDockColumn
          activePanel={activePanel}
          hostId={hostId}
          worktreeId={worktreeId}
          name={worktreeName || ''}
          availableWidth={sessionContentRowWidth}
          onRequestClose={() => setActivePanel(null)}
        />
      )}
    </View>
  )
}
