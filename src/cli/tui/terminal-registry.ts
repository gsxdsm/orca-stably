import { groupTerminalsByWorktree } from './terminals-by-worktree'
import { MAX_PANES } from './pane-layout'
import type { FocusedTerminalPane } from './focused-terminal-pane'
import type { TuiRpcClient } from './tui-rpc-client'
import type { TerminalRef } from './tui-input'
import type { RuntimeTerminalListResult } from '../../shared/runtime-types'

/** Owns the all-terminals map (one terminal.list poll, grouped by worktree) and
 *  keeps the focused pane handle valid as the map and selection change. Pulled
 *  out of the controller so that file stays focused on layout + input. */
export class TerminalRegistry {
  private byWorktree = new Map<string, TerminalRef[]>()
  private token = 0

  constructor(
    private readonly client: TuiRpcClient,
    private readonly pane: FocusedTerminalPane,
    private readonly onChange: () => void
  ) {}

  get byWorktreeMap(): ReadonlyMap<string, readonly TerminalRef[]> {
    return this.byWorktree
  }

  /** The given worktree's terminals (right-pane tabs), capped at MAX_PANES. */
  forWorktree(worktreeId: string | undefined): TerminalRef[] {
    return (worktreeId ? this.byWorktree.get(worktreeId) : undefined)?.slice(0, MAX_PANES) ?? []
  }

  /** Poll every terminal once and group by worktree, then keep the focused
   *  handle pointing at a terminal of the selected worktree. */
  async reload(selectedWorktreeId: string | undefined): Promise<void> {
    const token = ++this.token
    try {
      const list = await this.client.call<RuntimeTerminalListResult>('terminal.list', {})
      if (token !== this.token) {
        return
      }
      this.byWorktree = groupTerminalsByWorktree(list.result.terminals)
    } catch {
      // Keep the last map on a transient failure; the next poll re-syncs.
    }
    this.ensureFocused(selectedWorktreeId)
    this.onChange()
  }

  /** Keep the pane handle on a terminal of the selected worktree (default the
   *  first), or null when it has none. */
  ensureFocused(selectedWorktreeId: string | undefined): void {
    const refs = this.forWorktree(selectedWorktreeId)
    if (!refs.some((ref) => ref.handle === this.pane.handle)) {
      this.pane.setHandle(refs[0]?.handle ?? null)
    }
  }
}
