import {
  getUsageWindowSections,
  WEEKLY_WINDOW_MINUTES,
  type UsageWindowSection
} from '../../../src/shared/agent-usage/display/usage-provider-windows'
import { formatWindowLabel } from '../../../src/shared/agent-usage/rate-limits/rate-limit-window-label'
import {
  listUsageWindowSlots,
  parseUsageHistory,
  usageHistoryKey,
  type UsageHistorySample
} from '../../../src/shared/agent-usage/rate-limits/usage-window-history'
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
  const history = parseUsageHistory(snapshot.rateLimits.usageHistory)
  const providers = [
    snapshot.rateLimits.claude,
    snapshot.rateLimits.codex,
    ...getOtherUsageProviders(snapshot)
  ]
  for (const limits of providers) {
    if (!limits || limits.updatedAt === 0) {
      continue
    }
    const ids = new Map(listUsageWindowSlots(limits).map(({ id, window }) => [window, id]))
    for (const section of getUsageWindowSections(limits)) {
      if (section.window) {
        const { usedPercent, resetsAt, windowMinutes } = section.window
        const id = ids.get(section.window)
        const series = id ? history[usageHistoryKey(limits.provider, id)] : undefined
        const start = (resetsAt ?? limits.updatedAt) - windowMinutes * 60_000
        const samples = boundedSamples([
          ...(series?.samples.filter(({ at }) => at >= start && at < limits.updatedAt) ?? []),
          { at: limits.updatedAt, usedPercent }
        ])
        usage.push({
          hostId,
          provider: limits.provider,
          window: watchWindowLabel(section, windowMinutes),
          usedPercent,
          updatedAt: limits.updatedAt,
          windowMinutes,
          samples,
          ...(resetsAt !== null ? { resetsAt } : {})
        })
      }
    }
  }
  return usage
}

function boundedSamples(samples: UsageHistorySample[]): UsageHistorySample[] {
  const limit = 16
  const ordered = [...new Map(samples.map((sample) => [sample.at, sample])).values()]
    .filter(
      ({ at, usedPercent }) =>
        Number.isSafeInteger(at) && at >= 0 && usedPercent >= 0 && usedPercent <= 100
    )
    .sort((a, b) => a.at - b.at)
  return ordered.length <= limit
    ? ordered
    : Array.from(
        { length: limit },
        (_, index) => ordered[Math.round((index * (ordered.length - 1)) / (limit - 1))]!
      )
}
