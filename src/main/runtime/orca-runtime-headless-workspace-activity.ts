import { OrcaRuntimeWithWindowlessTerminalActivity } from './sidebar-inputs/orca-runtime-windowless-terminal-activity'
import { ORCA_SIDEBAR_INPUTS_IS_MAIN } from '../../shared/sidebar-inputs-switch'
import { HEADLESS_RUNTIME_WINDOW_ID } from '../../shared/runtime-session-contracts'
import { agentPhaseTransition } from '../../shared/agent-status/lifecycle/agent-transitions'
import { RECENT_STAMP_THROTTLE_MS } from '../../shared/sidebar-list/sort-stamps'
import type { AgentPaneChange, AgentPaneWorkspace } from '../agent-hooks/agent-transition-detector'
import { readWorkspaceRecord, writeWorkspaceRecord } from './sidebar-inputs/sort-stamp-records'
import {
  isWslMoveProjectBlocked,
  wslMoveProjectRefForWorkspace
} from '../persistence/moving-wsl-projects/wsl-move-scope-guard'

/** Terminal start and exit stamps come from the upstream windowless owner. Agent turns are this fork's extra. */
export abstract class OrcaRuntimeWithHeadlessWorkspaceActivity extends OrcaRuntimeWithWindowlessTerminalActivity {
  /** Agents work for hours in one terminal: their prompts, finishes and input requests are its activity too. */
  protected noteHeadlessAgentChange(change: AgentPaneChange): void {
    // The same turn edges main's sort stamps count for Recent.
    if (change.kind !== 'moved' || agentPhaseTransition(change.from, change.to) === null) {
      return
    }
    if (!ORCA_SIDEBAR_INPUTS_IS_MAIN && this.authoritativeWindowId === HEADLESS_RUNTIME_WINDOW_ID) {
      this.stampHeadlessAgentActivity(change.workspace)
    }
  }

  private stampHeadlessAgentActivity(workspace: AgentPaneWorkspace): void {
    try {
      if (
        !workspace.sshHostId &&
        isWslMoveProjectBlocked(
          this.store ?? undefined,
          wslMoveProjectRefForWorkspace(workspace.worktreeId)
        )
      ) {
        return
      }
      // Only a workspace with a record is stamped; writing would create one for a stale id.
      const stored = readWorkspaceRecord<{ lastActivityAt?: number }>(this.store, workspace)
      if (!stored) {
        return
      }
      const now = Date.now()
      // A busy agent re-lists the row at most this often, as main's stamps do.
      if (now - (stored.lastActivityAt ?? 0) < RECENT_STAMP_THROTTLE_MS) {
        return
      }
      writeWorkspaceRecord(this.store, workspace, { lastActivityAt: now })
      this.sortStampNotices.schedule(workspace.worktreeId)
    } catch (error) {
      console.warn('[workspace-activity] Could not record activity', error)
    }
  }
}
