import { formatWindowLabel } from '../../../../src/shared/agent-usage/rate-limits/rate-limit-window-label'
import {
  WEEKLY_WINDOW_MINUTES,
  type UsageWindowSection
} from '../../../../src/shared/agent-usage/display/usage-provider-windows'
import {
  formatPoolLabel,
  isGroupedUsagePool,
  type UsagePoolSibling
} from '../../../../src/shared/agent-usage/display/grouped-usage-pool'
import type { Translate } from '../../i18n/mobile-i18n'

const SESSION_WINDOW_MINUTES = 300

function formatWindowLength(minutes: number, t: Translate): string {
  if (minutes === SESSION_WINDOW_MINUTES) {
    return t('accounts.screen.sessionWindow', '5h')
  }
  if (minutes === WEEKLY_WINDOW_MINUTES) {
    return t('accounts.screen.weeklyWindow', '7d')
  }
  return formatWindowLabel(minutes)
}

// The desktop roster's labels, except 5h and 7d use mobile's translated copy (desktop shows 7d as "wk").
export function getAccountUsageWindowLabel(
  section: UsageWindowSection,
  buckets: readonly UsagePoolSibling[],
  t: Translate
): string {
  if (section.kind === 'bucket') {
    return isGroupedUsagePool(section.window)
      ? formatPoolLabel(section.window, buckets, (minutes) => formatWindowLength(minutes, t))
      : section.name
  }
  if (section.kind === 'fableWeekly') {
    return t('accounts.screen.fableWindow', 'Fable')
  }
  if (section.kind === 'mcp') {
    return t('accounts.screen.mcpWindow', 'MCP')
  }
  return formatWindowLength(
    section.window?.windowMinutes ??
      (section.kind === 'session' ? SESSION_WINDOW_MINUTES : WEEKLY_WINDOW_MINUTES),
    t
  )
}
