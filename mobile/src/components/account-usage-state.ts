// Why: keep these shapes in lockstep with src/shared/types.ts and
// src/shared/rate-limit-types.ts. We don't import from desktop here because
// the mobile bundle must not pull in Electron-coupled type files.
//
// Pure state/selectors live here (no React Native imports) so they can be
// unit-tested directly; AccountUsage.tsx re-exports them alongside the
// UsageBar component.
export type RateLimitWindow = {
  usedPercent: number
  windowMinutes: number
  resetsAt: number | null
  resetDescription: string | null
}

export type ProviderRateLimits = {
  provider: 'claude' | 'codex' | 'gemini' | 'opencode-go'
  session: RateLimitWindow | null
  weekly: RateLimitWindow | null
  monthly?: RateLimitWindow | null
  updatedAt: number
  error: string | null
  status: 'idle' | 'fetching' | 'ok' | 'error' | 'unavailable'
}

export type InactiveAccountUsage = {
  accountId: string
  claude: ProviderRateLimits | null
  updatedAt: number
  isFetching: boolean
}

export type ClaudeAccountSummary = {
  id: string
  email: string
  organizationName?: string | null
}

export type CodexAccountSummary = {
  id: string
  email: string
  workspaceLabel?: string | null
}

export type AccountsSnapshot = {
  claude: { accounts: ClaudeAccountSummary[]; activeAccountId: string | null }
  codex: { accounts: CodexAccountSummary[]; activeAccountId: string | null }
  rateLimits: {
    claude: ProviderRateLimits | null
    codex: ProviderRateLimits | null
    inactiveClaudeAccounts: InactiveAccountUsage[]
    inactiveCodexAccounts: InactiveAccountUsage[]
  }
}

export type ProviderKey = 'claude' | 'codex'

export function getActiveProviderRateLimits(
  snapshot: AccountsSnapshot,
  provider: ProviderKey
): ProviderRateLimits | null {
  return provider === 'claude' ? snapshot.rateLimits.claude : snapshot.rateLimits.codex
}

export function getInactiveProviderUsage(
  snapshot: AccountsSnapshot,
  provider: ProviderKey,
  accountId: string
): InactiveAccountUsage | null {
  const list =
    provider === 'claude'
      ? snapshot.rateLimits.inactiveClaudeAccounts
      : snapshot.rateLimits.inactiveCodexAccounts
  return list.find((u) => u.accountId === accountId) ?? null
}

// Why: rate limits are fetched for the active target even when no Orca-managed
// account exists (the default target is the agent's own system-default login).
// Treat a provider as having usage worth showing when a fetch succeeded or any
// window has data; an unavailable/error provider with no windows means the
// system-default login has no credentials for it, so there is nothing to show.
export function hasActiveProviderUsage(limits: ProviderRateLimits | null): boolean {
  if (!limits) {
    return false
  }
  if (limits.session != null || limits.weekly != null || limits.monthly != null) {
    return true
  }
  return limits.status === 'ok'
}

// Why: the usage UI must render for the system-default login, not only for
// Orca-managed accounts. Show a provider when it has at least one managed
// account OR active rate-limit data for the system-default target.
export function hasRenderableUsage(snapshot: AccountsSnapshot, provider: ProviderKey): boolean {
  const accounts = provider === 'claude' ? snapshot.claude.accounts : snapshot.codex.accounts
  if (accounts.length > 0) {
    return true
  }
  return hasActiveProviderUsage(getActiveProviderRateLimits(snapshot, provider))
}
