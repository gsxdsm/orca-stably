import { Pressable, StyleSheet, View } from 'react-native'
import { List, Plus, Search, SquareTerminal, UserCircle, X } from 'lucide-react-native'
import { useSideRailContent } from '../layout/side-rail'
import { colors, radii, spacing } from '../theme/mobile-theme'
import type { HostScreenController } from './use-host-screen-controller'

type RailButtonProps = {
  readonly label: string
  readonly onPress: () => void
  readonly disabled?: boolean
  readonly primary?: boolean
  readonly children: React.ReactNode
}

function RailButton({
  label,
  onPress,
  disabled = false,
  primary = false,
  children
}: RailButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        pressed && styles.pressed,
        disabled && styles.disabled
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  )
}

function HostScreenSideRail({ controller }: { controller: HostScreenController }) {
  const { actions, connState, floatingWorkspaceEnabled, hostId, state } = controller
  const connected = connState === 'connected'
  const iconColor = connected ? colors.textSecondary : colors.textMuted
  const hostPath = `/h/${encodeURIComponent(hostId)}`
  return (
    <View style={styles.rail}>
      <RailButton
        label="Accounts"
        onPress={() => actions.navigateFromHostList(`${hostPath}/accounts`)}
        disabled={!connected}
      >
        <UserCircle size={18} color={iconColor} />
      </RailButton>
      <RailButton
        label="Tasks"
        onPress={() => actions.navigateFromHostList(`${hostPath}/tasks`)}
        disabled={!connected}
      >
        <List size={18} color={iconColor} />
      </RailButton>
      <RailButton
        label={state.showSearch ? 'Close search' : 'Search workspaces'}
        onPress={() => state.setShowSearch((shown) => !shown)}
      >
        {state.showSearch ? (
          <X size={18} color={colors.textSecondary} />
        ) : (
          <Search size={18} color={colors.textSecondary} />
        )}
      </RailButton>
      <View style={styles.divider} />
      {floatingWorkspaceEnabled ? (
        <RailButton
          label="Floating Workspace"
          onPress={actions.openFloatingWorkspace}
          disabled={!connected}
        >
          <SquareTerminal size={18} color={connected ? colors.textPrimary : colors.textMuted} />
        </RailButton>
      ) : null}
      <RailButton
        label="New workspace or project"
        onPress={actions.openCreateMenu}
        disabled={!connected}
        primary
      >
        <Plus size={22} color={colors.bgBase} strokeWidth={2.4} />
      </RailButton>
    </View>
  )
}

/** The folded host list's actions, in the side rail instead of the toolbar and floating button. */
export function usePublishHostScreenSideRail(controller: HostScreenController): void {
  useSideRailContent(
    controller.actionsInRail ? <HostScreenSideRail controller={controller} /> : null
  )
}

const styles = StyleSheet.create({
  rail: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primary: {
    width: 52,
    height: 52,
    borderRadius: 26,
    // Same fill as NewWorkspaceFab, which this replaces.
    backgroundColor: colors.surfaceBright
  },
  pressed: {
    opacity: 0.7
  },
  disabled: {
    opacity: 0.45
  },
  divider: {
    width: 24,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle
  }
})
