import { Folder, GitBranch, MoreHorizontal } from 'lucide-react-native'
import { MobileSessionHeaderIconButton } from './MobileSessionHeaderIconButton'
import type { ActivePanel } from './session-panel-host'

export type MobileSessionPanelActionsProps = {
  readonly isFolderWorkspaceRoute: boolean
  readonly isFloatingWorkspaceRoute: boolean
  readonly activePanel: ActivePanel
  readonly showHeaderMoreButton: boolean
  readonly handlePanelTap: (panel: Exclude<ActivePanel, null>) => void
  readonly setShowHeaderMoreActions: (show: boolean) => void
}

// Files / Source Control / More, shown in the header or, when the window has one, the side rail.
export function MobileSessionPanelActions({
  isFolderWorkspaceRoute,
  isFloatingWorkspaceRoute,
  activePanel,
  showHeaderMoreButton,
  handlePanelTap,
  setShowHeaderMoreActions
}: MobileSessionPanelActionsProps) {
  return (
    <>
      {!isFloatingWorkspaceRoute && (
        <MobileSessionHeaderIconButton
          active={activePanel === 'files'}
          accessibilityLabel="Open file explorer"
          icon={Folder}
          onPress={() => handlePanelTap('files')}
        />
      )}
      {!isFolderWorkspaceRoute && !isFloatingWorkspaceRoute && (
        <MobileSessionHeaderIconButton
          active={activePanel === 'sourceControl'}
          accessibilityLabel="Open source control"
          icon={GitBranch}
          onPress={() => handlePanelTap('sourceControl')}
        />
      )}
      {showHeaderMoreButton ? (
        <MobileSessionHeaderIconButton
          active={activePanel === 'pr'}
          accessibilityLabel="More session actions"
          icon={MoreHorizontal}
          onPress={() => setShowHeaderMoreActions(true)}
        />
      ) : null}
    </>
  )
}
