import type { Tab } from '../../../shared/types'

/**
 * Decide the initial `viewMode` for a newly launched agent tab from the
 * opt-in `openAgentTabsInChatByDefault` setting.
 *
 * Returns `'chat'` only when the setting is explicitly on; otherwise returns
 * `undefined` so the tab keeps the implicit default (`'terminal'`) and stays
 * backward-compatible with tabs persisted before the setting existed. A pure
 * function so the decision can be unit-tested without the store or launch path.
 */
export function decideInitialAgentTabViewMode(
  openAgentTabsInChatByDefault: boolean | undefined
): Tab['viewMode'] {
  return openAgentTabsInChatByDefault === true ? 'chat' : undefined
}
