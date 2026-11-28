import {
  getUsageWindowSections,
  WEEKLY_WINDOW_MINUTES,
  type UsageWindowSection
} from '../../../src/shared/agent-usage/display/usage-provider-windows'
import { formatWindowLabel } from '../../../src/shared/agent-usage/rate-limits/rate-limit-window-label'
import type { AccountsSnapshot } from '../accounts/accounts-snapshot'
import { getOtherUsageProviders } from '../accounts/usage/usage-selectors'
import { translate } from '../i18n/mobile-i18n'
import type { WatchUsage } from './watch-contract'

function watchWindowLabel(section: UsageWindowSection, minutes: number): string {
  if (section.kind === 'bucket') {
    return section.name
  }
  if (section.kind === 'fableWeekly') {
    return translate('accounts.screen.fableWindow', 'Fable')
  }
  if (section.kind === 'mcp') {
    return translate('accounts.screen.mcpWindow', 'MCP')
  }
  if (minutes === 300) {
    return translate('accounts.screen.sessionWindow', '5h')
  }
  if (minutes === WEEKLY_WINDOW_MINUTES) {
    return translate('accounts.screen.weeklyWindow', '7d')
  }
  return formatWindowLabel(minutes)
}

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
        const { usedPercent, resetsAt, windowMinutes } = section.window
        usage.push({
          hostId,
          provider: limits.provider,
          window: watchWindowLabel(section, windowMinutes),
          usedPercent,
          updatedAt: limits.updatedAt,
          ...(resetsAt !== null ? { resetsAt } : {})
        })
      }
    }
  }
  return usage
}
