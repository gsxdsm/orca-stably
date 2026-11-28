import { getUsageWindowSections } from '../../../src/shared/agent-usage/display/usage-provider-windows'
import type { AccountsSnapshot } from '../accounts/accounts-snapshot'
import { getOtherUsageProviders } from '../accounts/usage/usage-selectors'
import { getAccountUsageWindowLabel } from '../accounts/usage/usage-window-label'
import { translate } from '../i18n/mobile-i18n'
import type { WatchUsage } from './watch-contract'

export function watchAccountUsage(hostId: string, snapshot: AccountsSnapshot): WatchUsage[] {
  const usage: WatchUsage[] = []
  const providers = [
    snapshot.rateLimits.claude,
    snapshot.rateLimits.codex,
    ...getOtherUsageProviders(snapshot)
  ]
  for (const limits of providers) {
    if (!limits || limits.updatedAt === 0) {
      continue
    }
    for (const section of getUsageWindowSections(limits)) {
      if (section.window) {
        const { usedPercent, resetsAt } = section.window
        usage.push({
          hostId,
          provider: limits.provider,
          window: getAccountUsageWindowLabel(section, limits.buckets ?? [], translate),
          usedPercent,
          updatedAt: limits.updatedAt,
          ...(resetsAt !== null ? { resetsAt } : {})
        })
      }
    }
  }
  return usage
}
