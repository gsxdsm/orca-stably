import { afterEach, expect, it, vi } from 'vitest'
import { OAuthUsageError } from '../providers/claude/claude-oauth-usage-error'
import { fetchClaudeOAuthUsage } from '../providers/claude/claude-oauth-usage-request'
import { RateLimitService } from './rate-limit-service'

const credentials = vi.hoisted(() => ({
  token: 'expired-token',
  expiresAt: Date.parse('2026-11-28T11:00:00Z')
}))

vi.mock('../providers/claude/claude-oauth-credentials', () => ({
  readClaudeOAuthCredentials: async () => ({
    token: credentials.token,
    accessTokenExpiresAt: credentials.expiresAt,
    hasRefreshableCredentials: true,
    source: 'credentials-file'
  }),
  resolveClaudeOAuthCredentialReadOptions: () => undefined
}))
vi.mock('../providers/claude/claude-oauth-usage-request', () => ({
  fetchClaudeOAuthUsage: vi.fn()
}))
vi.mock('../../claude-accounts/profiles/routing/claude-profile-installed-router', () => ({
  getClaudeProfileRouter: () => ({
    accountUsagePreparation: (id: string) => ({
      configDir: `/accounts/${id}`,
      envPatch: { CLAUDE_CONFIG_DIR: `/accounts/${id}` },
      provenance: 'managed'
    })
  }),
  getClaudeWslProfileRouter: () => null
}))

vi.mock('../../minimax/minimax-cookie-store', () => ({
  hasMiniMaxSessionCookie: async () => false
}))
vi.mock('../../minimax/minimax-api-key-store', () => ({ hasMiniMaxApiKey: async () => false }))
vi.mock('../../zcode/zcode-plan-api-key-store', () => ({ hasZcodePlanApiKey: async () => false }))

const start = Date.parse('2026-11-28T12:00:00Z')

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(fetchClaudeOAuthUsage).mockReset()
  credentials.token = 'expired-token'
  credentials.expiresAt = Date.parse('2026-11-28T11:00:00Z')
})

it('does not re-send an inactive account token the usage server rejected', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(start)
  vi.mocked(fetchClaudeOAuthUsage).mockRejectedValue(
    new OAuthUsageError('OAuth API returned 401', 401, true)
  )
  const service = new RateLimitService()
  service.setInactiveClaudeAccountsResolver(() => [{ id: 'idle' }])

  for (let pass = 0; pass < 3; pass++) {
    vi.setSystemTime(start + pass * 61_000)
    await service.fetchInactiveClaudeAccountsOnOpen()
  }
  expect(fetchClaudeOAuthUsage).toHaveBeenCalledTimes(1)
  const { inactiveClaudeAccounts } = await service.getState()
  expect(inactiveClaudeAccounts[0]?.rateLimits?.usageMetadata?.failureKind).toBe('stale-token')

  // A wrongly stored expiry still gets one try an hour, far below the 429 trigger.
  vi.setSystemTime(start + 3_600_000)
  await service.fetchInactiveClaudeAccountsOnOpen()
  expect(fetchClaudeOAuthUsage).toHaveBeenCalledTimes(2)

  credentials.token = 'refreshed-token'
  vi.setSystemTime(start + 3_661_000)
  await service.fetchInactiveClaudeAccountsOnOpen()
  expect(fetchClaudeOAuthUsage).toHaveBeenCalledTimes(3)
  expect(vi.mocked(fetchClaudeOAuthUsage).mock.calls[2]?.[0]).toBe('refreshed-token')
})

it.each([
  [
    'a server error',
    new OAuthUsageError('OAuth API returned 500', 500, false),
    credentials.expiresAt
  ],
  [
    'a missing scope',
    new OAuthUsageError('requires user:profile scope', 403, true),
    credentials.expiresAt
  ],
  [
    'a 401 before the stored expiry',
    new OAuthUsageError('OAuth API returned 401', 401, true),
    start + 3_600_000
  ]
])('keeps re-sending an inactive account token after %s', async (_label, error, expiresAt) => {
  vi.useFakeTimers()
  credentials.expiresAt = expiresAt
  vi.mocked(fetchClaudeOAuthUsage).mockRejectedValue(error)
  const service = new RateLimitService()
  service.setInactiveClaudeAccountsResolver(() => [{ id: 'idle' }])

  for (let pass = 0; pass < 2; pass++) {
    vi.setSystemTime(start + pass * 61_000)
    await service.fetchInactiveClaudeAccountsOnOpen()
  }
  expect(fetchClaudeOAuthUsage).toHaveBeenCalledTimes(2)
})
