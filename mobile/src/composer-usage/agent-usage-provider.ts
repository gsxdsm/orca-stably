import * as z from 'zod'
import {
  ProviderRateLimitsSchema,
  type AccountsSnapshot,
  type ProviderRateLimits,
  type RateLimitWindow
} from '../accounts/accounts-snapshot'
import {
  listUsageWindowSlots,
  parseUsageHistory,
  usageHistoryKey,
  type UsageHistorySample,
  type UsageWindowSlot
} from '../../../src/shared/agent-usage/rate-limits/usage-window-history'

/** `snapshot.rateLimits` keys whose quota a coding agent draws on. */
export type UsageProviderKey =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'opencodeGo'
  | 'kimi'
  | 'antigravity'
  | 'grok'
  | 'cursor'

// Only agents that spend the provider plan the desktop polls; others (e.g. aider, openclaude) bring their own keys.
const AGENT_USAGE_PROVIDERS = new Map<string, UsageProviderKey>([
  ['claude', 'claude'],
  ['claude-agent-teams', 'claude'],
  ['codex', 'codex'],
  ['gemini', 'gemini'],
  ['opencode', 'opencodeGo'],
  ['opencode2', 'opencodeGo'],
  ['kimi', 'kimi'],
  ['antigravity', 'antigravity'],
  ['grok', 'grok'],
  ['cursor', 'cursor']
])

const PROVIDER_IDS: Record<UsageProviderKey, ProviderRateLimits['provider']> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  opencodeGo: 'opencode-go',
  kimi: 'kimi',
  antigravity: 'antigravity',
  grok: 'grok',
  cursor: 'cursor'
}

export const USAGE_PROVIDER_NAMES: Record<UsageProviderKey, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  opencodeGo: 'OpenCode Go',
  kimi: 'Kimi',
  antigravity: 'Antigravity',
  grok: 'Grok',
  cursor: 'Cursor'
}

export type ComposerUsageWindowChoice = 'session' | 'weekly'

export type UsageWindowEntry = UsageWindowSlot<RateLimitWindow>

export type AgentUsage = {
  provider: UsageProviderKey
  windows: UsageWindowEntry[]
}

export function usageProviderForAgent(agent: string | null | undefined): UsageProviderKey | null {
  return (agent && AGENT_USAGE_PROVIDERS.get(agent)) || null
}

// Providers beyond Claude/Codex ride the snapshot's passthrough fields, so validate them here.
function readProviderLimits(
  snapshot: AccountsSnapshot,
  provider: UsageProviderKey
): ProviderRateLimits | null {
  const raw: unknown = snapshot.rateLimits[provider]
  const parsed = ProviderRateLimitsSchema.safeParse(raw)
  return parsed.success && parsed.data.provider === PROVIDER_IDS[provider] ? parsed.data : null
}

export function listUsageWindows(limits: ProviderRateLimits): UsageWindowEntry[] {
  return listUsageWindowSlots<RateLimitWindow>(limits)
}

/** The tab agent's provider usage, or null when the meter should stay hidden. */
export function selectAgentUsage(
  snapshot: AccountsSnapshot | null,
  agent: string | null | undefined
): AgentUsage | null {
  const provider = usageProviderForAgent(agent)
  if (!snapshot || !provider) {
    return null
  }
  const limits = readProviderLimits(snapshot, provider)
  const windows = limits ? listUsageWindows(limits) : []
  return windows.length > 0 ? { provider, windows } : null
}

const PROVIDER_ORDER: readonly UsageProviderKey[] = [
  'claude',
  'codex',
  'gemini',
  'opencodeGo',
  'kimi',
  'antigravity',
  'grok',
  'cursor'
]

/** Every polled provider with windows, the given one first, for the sheet's provider tabs. */
export function listProviderUsages(
  snapshot: AccountsSnapshot | null,
  first: UsageProviderKey
): AgentUsage[] {
  if (!snapshot) {
    return []
  }
  const ordered = [first, ...PROVIDER_ORDER.filter((provider) => provider !== first)]
  return ordered.flatMap((provider) => {
    const limits = readProviderLimits(snapshot, provider)
    const windows = limits ? listUsageWindows(limits) : []
    return windows.length > 0 ? [{ provider, windows }] : []
  })
}

const UsageHistoryCarrierSchema = z.object({ usageHistory: z.unknown().optional() })

/** The host's used-percent samples for one window, oldest first; empty on hosts that keep none. */
export function readUsageWindowHistory(
  snapshot: AccountsSnapshot | null,
  provider: UsageProviderKey,
  windowId: string
): UsageHistorySample[] {
  const carrier = UsageHistoryCarrierSchema.safeParse(snapshot?.rateLimits)
  if (!carrier.success) {
    return []
  }
  const series = parseUsageHistory(carrier.data.usageHistory)[usageHistoryKey(provider, windowId)]
  // The phone's Hermes engine lacks toSorted.
  return series ? [...series.samples].sort((a, b) => a.at - b.at) : []
}

// Fall back to the other standard window, then whatever the provider reports (monthly-only plans).
export function pickComposerUsageWindow(
  windows: readonly UsageWindowEntry[],
  choice: ComposerUsageWindowChoice
): UsageWindowEntry | null {
  const other = choice === 'session' ? 'weekly' : 'session'
  return (
    windows.find((entry) => entry.kind === choice) ??
    windows.find((entry) => entry.kind === other) ??
    windows[0] ??
    null
  )
}

/** The 5-hour vs weekly choice. Hidden unless this usage includes a 5-hour window to switch to. */
export function composerUsageWindowToggleChoices(
  windows: readonly UsageWindowEntry[]
): readonly ComposerUsageWindowChoice[] {
  const hasSession = windows.some((entry) => entry.kind === 'session')
  const hasWeekly = windows.some((entry) => entry.kind === 'weekly')
  return hasSession && hasWeekly ? ['session', 'weekly'] : []
}

/** "5h", "7d", "30d": the window's length, which is what users call these limits. */
export function formatUsageWindowLength(windowMinutes: number): string {
  return windowMinutes < 1440
    ? `${Math.max(1, Math.round(windowMinutes / 60))}h`
    : `${Math.round(windowMinutes / 1440)}d`
}
