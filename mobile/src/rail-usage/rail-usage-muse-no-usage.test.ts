import { describe, expect, it } from 'vitest'
import { decodeAccountsSnapshot } from '../accounts/accounts-snapshot'
import { listRailUsage, pickRailUsageWindow } from './rail-usage-model'

const NOTICE = 'Muse has no usage data for this window yet; it appears after your first Muse turn'

// The host's reading of `muse usage --json` answering `reason: server_sent_no_usage` (2026-11-25).
const snapshot = (muse: Record<string, unknown>) =>
  decodeAccountsSnapshot({
    claude: { accounts: [], activeAccountId: null },
    codex: { accounts: [], activeAccountId: null },
    rateLimits: {
      claude: null,
      codex: null,
      muse,
      inactiveClaudeAccounts: [],
      inactiveCodexAccounts: []
    }
  })

describe('Muse before its first turn in a window', () => {
  it('gets a ring at 0 that carries the no-usage-yet notice', () => {
    const usages = listRailUsage(
      snapshot({
        provider: 'muse',
        session: { usedPercent: 0, windowMinutes: 300, resetsAt: null, resetDescription: null },
        weekly: null,
        updatedAt: 1_795_630_000_000,
        planType: null,
        error: null,
        notice: NOTICE,
        status: 'ok',
        usageMetadata: { source: 'cli', attemptedSources: ['cli'] }
      })
    )
    expect(usages.map((usage) => usage.provider)).toEqual(['muse'])
    expect(usages[0]!.notice).toBe(NOTICE)
    expect(pickRailUsageWindow(usages[0]!.windows)?.window.usedPercent).toBe(0)
  })

  it('still draws no ring for a real Muse failure', () => {
    const usages = listRailUsage(
      snapshot({
        provider: 'muse',
        session: null,
        weekly: null,
        updatedAt: 1_795_630_000_000,
        error: 'Muse usage is unavailable. Muse is signed in with an API key, not a subscription.',
        status: 'unavailable'
      })
    )
    expect(usages).toEqual([])
  })
})
