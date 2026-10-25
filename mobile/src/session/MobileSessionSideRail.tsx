import { ScrollView, StyleSheet, View } from 'react-native'
import { colors, spacing } from '../theme/mobile-theme'
import { SIDE_RAIL_DRAWN_BY_SCREEN, useSideRailContent } from '../layout/side-rail'
import { MobileSessionDismissKeyboardKey } from './MobileSessionDismissKeyboardKey'
import { MobileSessionAccessoryKeys } from './MobileSessionAccessoryKeys'
import { MobileSessionPanelActions } from './MobileSessionPanelActions'
import type { MobileSessionController } from './use-mobile-session-controller'

function MobileSessionSideRail({ controller }: { controller: MobileSessionController }) {
  const {
    isFolderWorkspaceRoute,
    isFloatingWorkspaceRoute,
    activePanel,
    showHeaderMoreButton,
    handlePanelTap,
    setShowHeaderMoreActions,
    activeMarkdownTab,
    activeFileTab,
    activeBrowserTab,
    showNativeChat,
    keyboardLift,
    dismissSoftwareKeyboard
  } = controller
  // Same condition as MobileSessionCommandDock: the terminal's keys only while its dock shows.
  const showTerminalKeys =
    !activeMarkdownTab && !activeFileTab && !activeBrowserTab && !showNativeChat
  return (
    <View style={styles.rail}>
      <MobileSessionPanelActions
        isFolderWorkspaceRoute={isFolderWorkspaceRoute}
        isFloatingWorkspaceRoute={isFloatingWorkspaceRoute}
        activePanel={activePanel}
        showHeaderMoreButton={showHeaderMoreButton}
        handlePanelTap={handlePanelTap}
        setShowHeaderMoreActions={setShowHeaderMoreActions}
      />
      {showTerminalKeys ? (
        <>
          <View style={styles.divider} />
          {keyboardLift > 0 ? (
            <MobileSessionDismissKeyboardKey onPress={dismissSoftwareKeyboard} />
          ) : null}
          {/* Why: default tap handling makes the first key tap dismiss the keyboard and get swallowed (#5106). */}
          <ScrollView
            style={styles.keys}
            contentContainerStyle={styles.keysContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            <MobileSessionAccessoryKeys controller={controller} inRail />
          </ScrollView>
        </>
      ) : null}
    </View>
  )
}

/** Unfolded, moves the session's panel actions and terminal keys into the side rail; folded,
 *  takes the rail's column for full-width content (the header pads for the status column). */
export function usePublishMobileSessionSideRail(controller: MobileSessionController): void {
  const mode = controller.sessionSideRail
  useSideRailContent(
    mode === 'actions' ? (
      <MobileSessionSideRail controller={controller} />
    ) : mode === 'fullWidth' ? (
      SIDE_RAIL_DRAWN_BY_SCREEN
    ) : null
  )
}

const styles = StyleSheet.create({
  // Fills the column below the status items; the keys scroll in what the panel actions leave.
  rail: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  divider: {
    width: 24,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle
  },
  keys: {
    flex: 1,
    alignSelf: 'stretch'
  },
  keysContent: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs
  }
})
