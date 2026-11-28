import { describe, expect, it } from 'vitest'
import { ANTIGRAVITY_NO_USAGE_YET_NOTICE } from '../../../src/shared/agent-usage/rate-limits/antigravity-statusline-usage'
import { decodeAccountsSnapshot } from '../accounts/accounts-snapshot'
import { selectHomeUsageSections } from '../home/tabs/home-usage-cards'
import {
  listRailUsage,
  pickRailUsageWindow,
  RAIL_USAGE_PROVIDER_AGENT
} from '../rail-usage/rail-usage-model'
import {
  composerUsageWindowToggleChoices,
  pickComposerUsageWindow,
  readUsageWindowHistory,
  selectAgentUsage,
  usageProviderForAgent
} from './agent-usage-provider'

const NOW = Date.parse('2026-11-27T05:00:00Z')
const RESET_5H = NOW + 4 * 60 * 60_000
const RESET_WEEKLY = NOW + 6 * 24 * 60 * 60_000

function makeSnapshot(
  antigravity: Record<string, unknown>,
  usageHistory?: Record<string, unknown>
) {
  return decodeAccountsSnapshot({
    claude: { accounts: [], activeAccountId: null },
    codex: { accounts: [], activeAccountId: null },
    rateLimits: {
      claude: null,
      codex: null,
      antigravity,
      inactiveClaudeAccounts: [],
      inactiveCodexAccounts: [],
      ...(usageHistory ? { usageHistory } : {})
    }
  })
}

describe('Antigravity mobile usage surfaces', () => {
  it('maps antigravity agent to antigravity provider and exposes both 5h and weekly windows + pool buckets', () => {
    expect(usageProviderForAgent('antigravity')).toBe('antigravity')

    const snapshot = makeSnapshot(
      {
        provider: 'antigravity',
        session: {
          usedPercent: 35,
          windowMinutes: 300,
          resetsAt: RESET_5H,
          resetDescription: null
        },
        weekly: {
          usedPercent: 48,
          windowMinutes: 10_080,
          resetsAt: RESET_WEEKLY,
          resetDescription: null
        },
        buckets: [
          {
            name: 'Gemini 5h',
            usedPercent: 35,
            windowMinutes: 300,
            resetsAt: RESET_5H,
            resetDescription: null
          },
          {
            name: 'Gemini weekly',
            usedPercent: 48,
            windowMinutes: 10_080,
            resetsAt: RESET_WEEKLY,
            resetDescription: null
          },
          {
            name: 'Claude/GPT 5h',
            usedPercent: 10,
            windowMinutes: 300,
            resetsAt: RESET_5H,
            resetDescription: null
          },
          {
            name: 'Claude/GPT weekly',
            usedPercent: 15,
            windowMinutes: 10_080,
            resetsAt: RESET_WEEKLY,
            resetDescription: null
          }
        ],
        updatedAt: NOW,
        error: null,
        status: 'ok',
        usageMetadata: { account: { id: null, email: 'owner@example.com' } }
      },
      {
        'antigravity:weekly': {
          resetsAt: RESET_WEEKLY,
          windowMinutes: 10_080,
          samples: [
            { at: NOW - 3_600_000, usedPercent: 40 },
            { at: NOW, usedPercent: 48 }
          ]
        }
      }
    )

    // Composer meter gets both 5h and weekly toggle choices.
    const usage = selectAgentUsage(snapshot, 'antigravity')
    expect(usage?.provider).toBe('antigravity')
    expect(composerUsageWindowToggleChoices(usage!.windows)).toEqual(['session', 'weekly'])
    expect(pickComposerUsageWindow(usage!.windows, 'session')?.window.usedPercent).toBe(35)
    expect(pickComposerUsageWindow(usage!.windows, 'weekly')?.window.usedPercent).toBe(48)
    expect(usage!.windows.map((w) => w.name ?? w.kind)).toEqual([
      'session',
      'weekly',
      'Gemini 5h',
      'Gemini weekly',
      'Claude/GPT 5h',
      'Claude/GPT weekly'
    ])

    // Rail ring includes Antigravity and follows the 5-hour / weekly toggle.
    const rail = listRailUsage(snapshot)
    expect(rail.map((entry) => entry.provider)).toEqual(['antigravity'])
    expect(pickRailUsageWindow(rail[0]!.windows, 'session')?.kind).toBe('session')
    expect(pickRailUsageWindow(rail[0]!.windows, 'session')?.window.usedPercent).toBe(35)
    expect(pickRailUsageWindow(rail[0]!.windows, 'weekly')?.kind).toBe('weekly')
    expect(pickRailUsageWindow(rail[0]!.windows, 'weekly')?.window.usedPercent).toBe(48)

    // Unified pop-up maps Antigravity to the antigravity vector agent logo and reads its history.
    expect(RAIL_USAGE_PROVIDER_AGENT.antigravity).toBe('antigravity')
    expect(readUsageWindowHistory(snapshot, 'antigravity', 'weekly')).toEqual([
      { at: NOW - 3_600_000, usedPercent: 40 },
      { at: NOW, usedPercent: 48 }
    ])

    // Mobile Home Usage tab includes Antigravity with email and both windows.
    const homeSections = selectHomeUsageSections(snapshot)
    expect(homeSections.map((section) => section.provider)).toEqual(['antigravity'])
    expect(homeSections[0]!.cards[0]!.email).toBe('owner@example.com')
    expect(homeSections[0]!.cards[0]!.limits?.session?.usedPercent).toBe(35)
    expect(homeSections[0]!.cards[0]!.limits?.weekly?.usedPercent).toBe(48)
  })

  it('shows clean 0% no-usage-yet state with notice on rail and composer', () => {
    const snapshot = makeSnapshot({
      provider: 'antigravity',
      session: { usedPercent: 0, windowMinutes: 300, resetsAt: null, resetDescription: null },
      weekly: { usedPercent: 0, windowMinutes: 10_080, resetsAt: null, resetDescription: null },
      updatedAt: NOW,
      error: null,
      notice: ANTIGRAVITY_NO_USAGE_YET_NOTICE,
      status: 'ok'
    })

    const rail = listRailUsage(snapshot)
    expect(rail).toHaveLength(1)
    expect(rail[0]!.notice).toBe(ANTIGRAVITY_NO_USAGE_YET_NOTICE)
    expect(pickRailUsageWindow(rail[0]!.windows, 'session')?.kind).toBe('session')
    expect(pickRailUsageWindow(rail[0]!.windows, 'session')?.window.usedPercent).toBe(0)
    expect(pickRailUsageWindow(rail[0]!.windows, 'weekly')?.kind).toBe('weekly')
    expect(pickRailUsageWindow(rail[0]!.windows, 'weekly')?.window.usedPercent).toBe(0)
  })
})
