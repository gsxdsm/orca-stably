import { Suspense, useState } from 'react'
import { lazyWithRetry as lazy } from '@/app-shell/startup/lazy-with-retry'
import EditorAutosaveController from '../../editor/autosave/EditorAutosaveController'
import { useAnyBrowserGuestNeedsPaint } from '../../browser-pane/host-guest/retention/browser-guest-paint-retention'
import { TerminalTitlebarTabs } from './TerminalTitlebarTabs'
import { TerminalSplitWorkspaceSurfaces } from './TerminalSplitWorkspaceSurfaces'
import { TerminalWorkspaceDialogs } from './TerminalWorkspaceDialogs'
import { WslHostStoppedWorkspaceNotice } from '../../wsl-host-stopped/WslHostStoppedWorkspaceNotice'
import type { TerminalController } from './use-terminal-controller'

const TerminalLegacyWorkspaceSurface = lazy(() =>
  import('./TerminalLegacyWorkspaceSurface').then((module) => ({
    default: module.TerminalLegacyWorkspaceSurface
  }))
)

export function TerminalSurface({
  controller
}: {
  controller: TerminalController
}): React.JSX.Element {
  const { renderedActiveWorktreeId } = controller
  const retainBrowserGuestPaint = useAnyBrowserGuestNeedsPaint(!renderedActiveWorktreeId)
  const legacyLayoutFree =
    !controller.effectiveActiveLayout && !controller.anyMountedWorktreeHasLayout
  // Latch on the first layout-free active workspace: afterwards the legacy surface stays mounted
  // through a null active workspace, so background terminals and retained browser guests survive
  // deselection exactly as the always-rendered surface did.
  const legacyActiveNow = Boolean(renderedActiveWorktreeId) && legacyLayoutFree
  const [legacyEverActive, setLegacyEverActive] = useState(false)
  if (legacyActiveNow && !legacyEverActive) {
    setLegacyEverActive(true)
  }
  return (
    <div
      // The workbench already removes hidden content from flow; only keep this ancestor paintable.
      className={`relative flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden${
        renderedActiveWorktreeId
          ? ''
          : retainBrowserGuestPaint
            ? ' opacity-0 pointer-events-none'
            : ' hidden'
      }`}
      data-rendered-active-worktree-id={renderedActiveWorktreeId ?? undefined}
    >
      <EditorAutosaveController />
      <TerminalTitlebarTabs controller={controller} />
      <TerminalSplitWorkspaceSurfaces controller={controller} />
      {(legacyEverActive || legacyActiveNow) && legacyLayoutFree ? (
        <Suspense fallback={null}>
          <TerminalLegacyWorkspaceSurface controller={controller} />
        </Suspense>
      ) : null}
      <WslHostStoppedWorkspaceNotice worktreeId={renderedActiveWorktreeId} />
      <TerminalWorkspaceDialogs controller={controller} />
    </div>
  )
}
