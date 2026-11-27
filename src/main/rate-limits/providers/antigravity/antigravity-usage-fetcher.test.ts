import { describe, expect, it } from 'vitest'
import type { ProviderRateLimits } from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import { ANTIGRAVITY_NO_USAGE_YET_NOTICE } from '../../../../shared/agent-usage/rate-limits/antigravity-statusline-usage'
import { fetchAntigravityRateLimits, selectAgyStatusPorts } from './antigravity-usage-fetcher'
import {
  parseAntigravityQuotaSummary,
  parseAntigravityUserStatusQuota
} from './antigravity-user-status-quota'

const NOW = Date.parse('2026-11-27T05:00:00Z')
const RESET_5H = '2026-11-27T10:00:00Z'
const RESET_WEEKLY = '2026-12-04T05:00:00Z'

const status = (configs: unknown[], extra: Record<string, unknown> = {}) => ({
  userStatus: { ...extra, cascadeModelConfigData: { clientModelConfigs: configs } }
})

const quotaSummary = {
  response: {
    groups: [
      {
        displayName: 'Gemini Models',
        buckets: [
          {
            bucketId: 'gemini-weekly',
            window: 'weekly',
            remainingFraction: 0.68,
            resetTime: RESET_WEEKLY
          },
          {
            bucketId: 'gemini-5h',
            window: '5h',
            remainingFraction: 0.45,
            resetTime: RESET_5H
          }
        ]
      },
      {
        displayName: 'Claude and GPT models',
        buckets: [
          {
            bucketId: '3p-weekly',
            window: 'weekly',
            remainingFraction: 0.9,
            resetTime: RESET_WEEKLY
          },
          {
            bucketId: '3p-5h',
            window: '5h',
            // proto3 omits zero: exhausted bucket arrives with only resetTime.
            resetTime: RESET_5H
          }
        ]
      }
    ]
  }
}

describe('parseAntigravityQuotaSummary', () => {
  it('parses both weekly and 5h buckets in canonical order and picks the tightest window for each', () => {
    const reading = parseAntigravityQuotaSummary(quotaSummary)
    expect(reading?.buckets).toEqual([
      {
        name: 'Gemini 5h',
        usedPercent: 55,
        windowMinutes: 300,
        resetsAt: Date.parse(RESET_5H),
        resetDescription: null
      },
      {
        name: 'Gemini weekly',
        usedPercent: 32,
        windowMinutes: 10_080,
        resetsAt: Date.parse(RESET_WEEKLY),
        resetDescription: null
      },
      {
        name: 'Claude/GPT 5h',
        usedPercent: 100,
        windowMinutes: 300,
        resetsAt: Date.parse(RESET_5H),
        resetDescription: null
      },
      {
        name: 'Claude/GPT weekly',
        usedPercent: 10,
        windowMinutes: 10_080,
        resetsAt: Date.parse(RESET_WEEKLY),
        resetDescription: null
      }
    ])
    expect(reading?.session).toEqual({
      usedPercent: 100,
      windowMinutes: 300,
      resetsAt: Date.parse(RESET_5H),
      resetDescription: null
    })
    expect(reading?.weekly).toEqual({
      usedPercent: 32,
      windowMinutes: 10_080,
      resetsAt: Date.parse(RESET_WEEKLY),
      resetDescription: null
    })
  })

  it('signals noUsageYet when a valid response carries empty groups', () => {
    expect(parseAntigravityQuotaSummary({ response: { groups: [] } })).toEqual({
      session: null,
      weekly: null,
      buckets: [],
      noUsageYet: true
    })
  })
})

describe('parseAntigravityUserStatusQuota', () => {
  it('folds effort variants into one bucket per model at its most-used variant', () => {
    const reading = parseAntigravityUserStatusQuota(
      status(
        [
          {
            label: 'Gemini 4 Neon (High)',
            quotaInfo: { remainingFraction: 0.8, resetTime: RESET_5H }
          },
          {
            label: 'Gemini 4 Neon (Low)',
            quotaInfo: { remainingFraction: 0.25, resetTime: RESET_5H }
          },
          // proto3 JSON drops a zero fraction: exhausted.
          { label: 'Claude Opus 5.5 (High)', quotaInfo: { resetTime: RESET_5H } },
          { label: 'No quota model' }
        ],
        { email: 'owner@example.com' }
      )
    )

    expect(reading?.buckets).toEqual([
      {
        name: 'Gemini 4 Neon',
        usedPercent: 75,
        windowMinutes: 300,
        resetsAt: Date.parse(RESET_5H),
        resetDescription: null
      },
      {
        name: 'Claude Opus 5.5',
        usedPercent: 100,
        windowMinutes: 300,
        resetsAt: Date.parse(RESET_5H),
        resetDescription: null
      }
    ])
    expect(reading?.session?.usedPercent).toBe(100)
    expect(reading?.weekly).toBeNull()
    expect(reading?.email).toBe('owner@example.com')
  })

  it('rejects payloads without model configs', () => {
    expect(parseAntigravityUserStatusQuota({ userStatus: {} })).toBeNull()
    expect(parseAntigravityUserStatusQuota('nope')).toBeNull()
  })
})

describe('fetchAntigravityRateLimits', () => {
  it('reads RetrieveUserQuotaSummary for both 5h and weekly windows and enriches email from GetUserStatus', async () => {
    const limits = await fetchAntigravityRateLimits({
      now: () => NOW,
      listListeners: async () => [
        {
          host: '127.0.0.1',
          port: 4001,
          pid: 101,
          processName: 'agy',
          commandLine: '/usr/local/bin/agy'
        },
        {
          host: '127.0.0.1',
          port: 4002,
          pid: 102,
          processName: 'agy',
          commandLine: '/usr/local/bin/agy acp --dangerously-skip-permissions'
        }
      ],
      postQuotaSummary: async (port) => {
        expect(port).toBe(4002)
        return quotaSummary
      },
      postUserStatus: async () =>
        status([{ label: 'Gemini 4 Neon (High)', quotaInfo: { remainingFraction: 0.45 } }], {
          email: 'owner@example.com',
          planStatus: { planInfo: { planName: 'Pro' } }
        })
    })

    expect(limits.status).toBe('ok')
    expect(limits.session?.usedPercent).toBe(100)
    expect(limits.weekly?.usedPercent).toBe(32)
    expect(limits.buckets?.map((b) => b.name)).toEqual([
      'Gemini 5h',
      'Gemini weekly',
      'Claude/GPT 5h',
      'Claude/GPT weekly'
    ])
    expect(limits.planType).toBe('Pro')
    expect(limits.usageMetadata?.account).toEqual({ id: null, email: 'owner@example.com' })
  })

  it('returns clean 0% no-usage-yet state when RetrieveUserQuotaSummary returns empty groups', async () => {
    const limits = await fetchAntigravityRateLimits({
      now: () => NOW,
      listListeners: async () => [
        { host: '127.0.0.1', port: 4002, processName: 'agy', commandLine: 'agy acp' }
      ],
      postQuotaSummary: async () => ({ response: { groups: [] } }),
      postUserStatus: async () => null
    })

    expect(limits.status).toBe('ok')
    expect(limits.session?.usedPercent).toBe(0)
    expect(limits.weekly?.usedPercent).toBe(0)
    expect(limits.notice).toBe(ANTIGRAVITY_NO_USAGE_YET_NOTICE)
  })

  it('reads only loopback ports agy holds and falls back to GetUserStatus when summary fails', async () => {
    const asked: number[] = []
    const limits = await fetchAntigravityRateLimits({
      now: () => NOW,
      listListeners: async () => [
        { host: '127.0.0.1', port: 4000, processName: 'node' },
        { host: '0.0.0.0', port: 4001, processName: 'agy' },
        { host: '127.0.0.1', port: 4002, processName: 'agy' },
        { host: '127.0.0.1', port: 4003, processName: 'agy' }
      ],
      postQuotaSummary: async () => {
        throw new Error('404 Not Found')
      },
      postUserStatus: async (port) => {
        asked.push(port)
        if (port === 4002) {
          throw new Error('TLS port')
        }
        return status([{ label: 'Gemini 3.8 Flash (High)', quotaInfo: { remainingFraction: 0.6 } }])
      }
    })

    expect(asked).toEqual([4002, 4003])
    expect(limits.status).toBe('ok')
    expect(limits.session?.usedPercent).toBe(40)
    expect(limits.buckets?.map((bucket) => bucket.name)).toEqual(['Gemini 3.8 Flash'])
  })

  it('keeps the previous reading while no agy runs, until its window resets', async () => {
    const previous: ProviderRateLimits = {
      provider: 'antigravity',
      session: {
        usedPercent: 20,
        windowMinutes: 300,
        resetsAt: NOW + 60_000,
        resetDescription: null
      },
      weekly: {
        usedPercent: 12,
        windowMinutes: 10_080,
        resetsAt: NOW + 60_000,
        resetDescription: null
      },
      updatedAt: NOW - 60_000,
      error: null,
      status: 'ok'
    }
    const noAgy = { listListeners: async () => [], postUserStatus: async () => null }

    expect(await fetchAntigravityRateLimits({ ...noAgy, now: () => NOW, previous })).toBe(previous)
    const afterReset = await fetchAntigravityRateLimits({
      ...noAgy,
      now: () => NOW + 120_000,
      previous
    })
    expect(afterReset.status).toBe('unavailable')
    expect(afterReset.session).toBeNull()
    expect(afterReset.weekly).toBeNull()
  })

  it('matches agy acp on every platform and skips interactive agy TUI ports', () => {
    expect(
      selectAgyStatusPorts([
        { host: '127.0.0.1', port: 1, processName: 'agy.exe', commandLine: 'agy.exe acp' },
        { host: '::1', port: 2, processName: 'agy' },
        { host: '127.0.0.1', port: 3, processName: 'agyx' },
        { host: '127.0.0.1', port: 4, processName: 'agy', commandLine: '/usr/local/bin/agy' }
      ])
    ).toEqual([1, 2])
  })
})
