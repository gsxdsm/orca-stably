import { describe, expect, it } from 'vitest'

import {
  hasActiveProviderUsage,
  hasRenderableUsage,
  type AccountsSnapshot,
  type ProviderRateLimits
} from './account-usage-state'

function makeLimits(overrides: Partial<ProviderRateLimits> = {}): ProviderRateLimits {
  return {
    provider: 'claude',
    session: null,
    weekly: null,
    monthly: null,
    updatedAt: 0,
    error: null,
    status: 'idle',
    ...overrides
  }
}

function makeSnapshot(
  overrides: {
    claudeLimits?: ProviderRateLimits | null
    codexLimits?: ProviderRateLimits | null
    claudeAccounts?: AccountsSnapshot['claude']['accounts']
    codexAccounts?: AccountsSnapshot['codex']['accounts']
  } = {}
): AccountsSnapshot {
  return {
    claude: { accounts: overrides.claudeAccounts ?? [], activeAccountId: null },
    codex: { accounts: overrides.codexAccounts ?? [], activeAccountId: null },
    rateLimits: {
      claude: overrides.claudeLimits ?? null,
      codex: overrides.codexLimits ?? null,
      inactiveClaudeAccounts: [],
      inactiveCodexAccounts: []
    }
  }
}

describe('hasActiveProviderUsage', () => {
  it('is false when there are no rate limits at all', () => {
    expect(hasActiveProviderUsage(null)).toBe(false)
  })

  it('is true when a session window has data', () => {
    expect(
      hasActiveProviderUsage(
        makeLimits({
          status: 'ok',
          session: { usedPercent: 12, windowMinutes: 300, resetsAt: null, resetDescription: null }
        })
      )
    ).toBe(true)
  })

  it('is true when a successful fetch returned ok even with empty windows', () => {
    expect(hasActiveProviderUsage(makeLimits({ status: 'ok' }))).toBe(true)
  })

  it('is false for an unavailable/error provider with no window data (no creds)', () => {
    expect(hasActiveProviderUsage(makeLimits({ status: 'unavailable' }))).toBe(false)
    expect(hasActiveProviderUsage(makeLimits({ status: 'error', error: 'nope' }))).toBe(false)
  })
})

describe('hasRenderableUsage', () => {
  it('is true when the provider has at least one managed account', () => {
    const snapshot = makeSnapshot({
      claudeAccounts: [{ id: 'a', email: 'x@y.z' }]
    })
    expect(hasRenderableUsage(snapshot, 'claude')).toBe(true)
  })

  // The bug: system-default auth has zero managed accounts but real usage data,
  // and the home screen used to hide it entirely.
  it('is true with zero managed accounts when active rate-limit data exists (system default)', () => {
    const snapshot = makeSnapshot({
      codexLimits: makeLimits({
        provider: 'codex',
        status: 'ok',
        session: { usedPercent: 40, windowMinutes: 300, resetsAt: null, resetDescription: null }
      })
    })
    expect(hasRenderableUsage(snapshot, 'codex')).toBe(true)
  })

  it('is false with zero accounts and no usable rate-limit data', () => {
    const snapshot = makeSnapshot({
      claudeLimits: makeLimits({ status: 'unavailable' })
    })
    expect(hasRenderableUsage(snapshot, 'claude')).toBe(false)
    expect(hasRenderableUsage(makeSnapshot(), 'claude')).toBe(false)
  })
})
