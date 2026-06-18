import { toSessionTabs, type SessionTab } from './session-tab'
import type { FocusedTerminalPane } from './focused-terminal-pane'

type ListAllResult = { snapshots?: { worktree?: string; tabs?: unknown[] }[] }

/** A minimal RPC surface; RuntimeClient satisfies it structurally. */
type RpcClient = {
  call<T>(method: string, params?: unknown): Promise<{ result: T }>
}

/** Polls session.tabs.listAll (every tab of every worktree — terminals, files,
 *  markdown, browser), groups them by worktree id, and keeps the focused pane's
 *  tab valid for the selected worktree. Source for both the nested sidebar tab
 *  lines and the right-pane tab strip. */
export class SessionTabsRegistry {
  private byWorktree = new Map<string, SessionTab[]>()
  private token = 0

  constructor(
    private readonly client: RpcClient,
    private readonly pane: FocusedTerminalPane,
    private readonly selectedWorktreeId: () => string | undefined,
    private readonly onChange: () => void
  ) {}

  get byWorktreeMap(): ReadonlyMap<string, readonly SessionTab[]> {
    return this.byWorktree
  }

  forWorktree(worktreeId: string | undefined): SessionTab[] {
    return (worktreeId ? this.byWorktree.get(worktreeId) : undefined)?.slice() ?? []
  }

  /** The selected worktree's tabs (right-pane strip + nesting). */
  forSelected(): SessionTab[] {
    return this.forWorktree(this.selectedWorktreeId())
  }

  /** Reload all tabs, then keep the focused tab valid for the selected worktree. */
  async sync(): Promise<void> {
    await this.reload()
    this.ensureFocused()
  }

  /** Keep the pane's tab pointing at a tab of the selected worktree (default the
   *  first), or none when it has no tabs. */
  ensureFocused(): void {
    const refs = this.forSelected()
    if (!refs.some((tab) => tab.id === this.pane.tabId)) {
      this.pane.setTab(refs[0] ?? null)
    }
  }

  /** Focus the (already-open) tab for a just-opened file path, if present. */
  focusOpened(relativePath: string): void {
    const opened = this.forSelected().find((tab) => tab.relativePath === relativePath)
    if (opened) {
      this.pane.setTab(opened)
      this.pane.focusInput()
    }
  }

  /** Find a tab across all worktrees by id (for resolving a jump target). */
  find(tabId: string): SessionTab | undefined {
    for (const tabs of this.byWorktree.values()) {
      const hit = tabs.find((tab) => tab.id === tabId)
      if (hit) {
        return hit
      }
    }
    return undefined
  }

  async reload(): Promise<void> {
    const token = ++this.token
    try {
      const { result } = await this.client.call<ListAllResult>('session.tabs.listAll', {})
      if (token !== this.token) {
        return
      }
      const map = new Map<string, SessionTab[]>()
      for (const snapshot of result.snapshots ?? []) {
        const worktreeId = typeof snapshot.worktree === 'string' ? snapshot.worktree : ''
        if (worktreeId) {
          map.set(worktreeId, toSessionTabs(worktreeId, (snapshot.tabs ?? []) as never[]))
        }
      }
      this.byWorktree = map
    } catch {
      // Keep the last map on a transient failure; the next poll re-syncs.
    }
    this.onChange()
  }
}
