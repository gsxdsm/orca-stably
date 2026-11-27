import { describe, expect, it } from 'vitest'
import { decodeAccountsSnapshot } from '../accounts/accounts-snapshot'
import {
  composerUsageWindowToggleChoices,
  pickComposerUsageWindow,
  selectAgentUsage
} from './agent-usage-provider'

const window = (usedPercent: number, windowMinutes: number, resetsAt: number | null = null) => ({
  usedPercent,
  windowMinutes,
  resetsAt,
  resetDescription: null
})
const limits = (provider: string, extra: Record<string, unknown>) => ({
  provider,
  session: null,
  weekly: null,
  updatedAt: 1,
  error: null,
  status: 'ok',
  ...extra
})
const snapshot = decodeAccountsSnapshot({
  claude: { accounts: [], activeAccountId: null },
  codex: { accounts: [], activeAccountId: null },
  rateLimits: {
    claude: limits('claude', { session: window(20, 300), weekly: window(55, 10080) }),
    codex: limits('codex', { session: window(0, 300, null), weekly: window(42, 10080) }),
    antigravity: limits('antigravity', { session: window(35, 300), weekly: window(48, 10080) }),
    grok: limits('grok', { weekly: window(62, 10080) }),
    muse: limits('muse', { session: window(15, 300) }),
    gemini: limits('gemini', {
      buckets: [
        { name: 'Flash', ...window(10, 1440) },
        { name: 'Pro', ...window(80, 1440) }
      ]
    }),
    opencodeGo: limits('opencode-go', { monthly: window(12, 43200) }),
    inactiveClaudeAccounts: [],
    inactiveCodexAccounts: []
  }
})

describe('selectAgentUsage', () => {
  it('maps agent ids to their provider and hides agents without usage', () => {
    expect(selectAgentUsage(snapshot, 'claude-agent-teams')?.provider).toBe('claude')
    expect(selectAgentUsage(snapshot, 'codex')?.provider).toBe('codex')
    expect(selectAgentUsage(snapshot, 'antigravity')?.provider).toBe('antigravity')
    expect(selectAgentUsage(snapshot, 'grok')?.provider).toBe('grok')
    expect(selectAgentUsage(snapshot, 'muse')?.provider).toBe('muse')
    expect(selectAgentUsage(snapshot, 'kimi')).toBeNull()
    expect(selectAgentUsage(snapshot, 'aider')).toBeNull()
    expect(selectAgentUsage(snapshot, null)).toBeNull()
  })

  it('picks 5-hour or weekly when present, keeps a 0% 5-hour window, and falls back cleanly', () => {
    const claude = selectAgentUsage(snapshot, 'claude')?.windows ?? []
    expect(pickComposerUsageWindow(claude, 'session')?.kind).toBe('session')
    expect(pickComposerUsageWindow(claude, 'session')?.window.usedPercent).toBe(20)
    expect(pickComposerUsageWindow(claude, 'weekly')?.kind).toBe('weekly')
    expect(pickComposerUsageWindow(claude, 'weekly')?.window.usedPercent).toBe(55)

    // A valid 0% 5-hour window with no reset time stays on 5-hour rather than jumping to weekly.
    const codex = selectAgentUsage(snapshot, 'codex')?.windows ?? []
    expect(pickComposerUsageWindow(codex, 'session')?.kind).toBe('session')
    expect(pickComposerUsageWindow(codex, 'session')?.window.usedPercent).toBe(0)
    expect(pickComposerUsageWindow(codex, 'weekly')?.kind).toBe('weekly')
    expect(pickComposerUsageWindow(codex, 'weekly')?.window.usedPercent).toBe(42)

    const antigravity = selectAgentUsage(snapshot, 'antigravity')?.windows ?? []
    expect(pickComposerUsageWindow(antigravity, 'session')?.window.usedPercent).toBe(35)
    expect(pickComposerUsageWindow(antigravity, 'weekly')?.window.usedPercent).toBe(48)

    // Weekly-only (Grok) and 5h-only (Muse) fall back to the only available window.
    const grok = selectAgentUsage(snapshot, 'grok')?.windows ?? []
    expect(pickComposerUsageWindow(grok, 'session')?.kind).toBe('weekly')
    expect(pickComposerUsageWindow(grok, 'weekly')?.kind).toBe('weekly')

    const muse = selectAgentUsage(snapshot, 'muse')?.windows ?? []
    expect(pickComposerUsageWindow(muse, 'session')?.kind).toBe('session')
    expect(pickComposerUsageWindow(muse, 'weekly')?.kind).toBe('session')

    // Monthly-only and bucket-only providers pick monthly / tightest bucket.
    const opencode = selectAgentUsage(snapshot, 'opencode')?.windows ?? []
    expect(pickComposerUsageWindow(opencode, 'session')?.kind).toBe('monthly')

    const gemini = selectAgentUsage(snapshot, 'gemini')?.windows ?? []
    expect(pickComposerUsageWindow(gemini, 'session')?.name).toBe('Pro')
    expect(pickComposerUsageWindow(gemini, 'weekly')?.name).toBe('Pro')
  })

  it('offers the 5-hour toggle only when that provider has a 5-hour window and a weekly window', () => {
    const claude = selectAgentUsage(snapshot, 'claude')?.windows ?? []
    expect(composerUsageWindowToggleChoices(claude)).toEqual(['session', 'weekly'])
    expect(
      composerUsageWindowToggleChoices(claude.filter((entry) => entry.kind !== 'session'))
    ).toEqual([])
    expect(
      composerUsageWindowToggleChoices(claude.filter((entry) => entry.kind !== 'weekly'))
    ).toEqual([])
  })
})
