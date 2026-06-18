import { toSessionTabs, type SessionTab } from './session-tab'

type ListAllResult = { snapshots?: { worktree?: string; tabs?: unknown[] }[] }

/** A minimal RPC surface; RuntimeClient satisfies it structurally. */
type RpcClient = {
  call<T>(method: string, params?: unknown): Promise<{ result: T }>
}

/** Polls session.tabs.listAll (every tab of every worktree — terminals, files,
 *  markdown, browser) and groups them by worktree id. Source for both the
 *  nested sidebar tab lines and the right-pane tab strip. */
export class SessionTabsRegistry {
  private byWorktree = new Map<string, SessionTab[]>()
  private token = 0

  constructor(
    private readonly client: RpcClient,
    private readonly onChange: () => void
  ) {}

  get byWorktreeMap(): ReadonlyMap<string, readonly SessionTab[]> {
    return this.byWorktree
  }

  forWorktree(worktreeId: string | undefined): SessionTab[] {
    return (worktreeId ? this.byWorktree.get(worktreeId) : undefined)?.slice() ?? []
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
