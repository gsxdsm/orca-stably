import { describe, expect, it } from 'vitest'
import type { ProviderRateLimits } from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import { fetchAntigravityRateLimits, selectAgyStatusPorts } from './antigravity-usage-fetcher'
import { parseAntigravityUserStatusQuota } from './antigravity-user-status-quota'

const NOW = Date.parse('2026-11-27T05:00:00Z')
const RESET = '2026-11-27T10:00:00Z'

const status = (configs: unknown[]) => ({
  userStatus: { cascadeModelConfigData: { clientModelConfigs: configs } }
})

describe('parseAntigravityUserStatusQuota', () => {
  it('folds effort variants into one bucket per model at its most-used variant', () => {
    const reading = parseAntigravityUserStatusQuota(
      status([
        { label: 'Gemini 4 Neon (High)', quotaInfo: { remainingFraction: 0.8, resetTime: RESET } },
        { label: 'Gemini 4 Neon (Low)', quotaInfo: { remainingFraction: 0.25, resetTime: RESET } },
        // proto3 JSON drops a zero fraction: exhausted.
        { label: 'Claude Opus 5.5 (High)', quotaInfo: { resetTime: RESET } },
        { label: 'No quota model' }
      ])
    )

    expect(reading?.buckets).toEqual([
      {
        name: 'Gemini 4 Neon',
        usedPercent: 75,
        windowMinutes: 300,
        resetsAt: Date.parse(RESET),
        resetDescription: null
      },
      {
        name: 'Claude Opus 5.5',
        usedPercent: 100,
        windowMinutes: 300,
        resetsAt: Date.parse(RESET),
        resetDescription: null
      }
    ])
    expect(reading?.session?.usedPercent).toBe(100)
  })

  it('rejects payloads without model configs', () => {
    expect(parseAntigravityUserStatusQuota({ userStatus: {} })).toBeNull()
    expect(parseAntigravityUserStatusQuota('nope')).toBeNull()
  })
})

describe('fetchAntigravityRateLimits', () => {
  it('reads only loopback ports agy holds and skips ports that refuse the route', async () => {
    const asked: number[] = []
    const limits = await fetchAntigravityRateLimits({
      now: () => NOW,
      listListeners: async () => [
        { host: '127.0.0.1', port: 4000, processName: 'node' },
        { host: '0.0.0.0', port: 4001, processName: 'agy' },
        { host: '127.0.0.1', port: 4002, processName: 'agy' },
        { host: '127.0.0.1', port: 4003, processName: 'agy' }
      ],
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
      weekly: null,
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
  })

  it('matches agy on every platform', () => {
    expect(
      selectAgyStatusPorts([
        { host: '127.0.0.1', port: 1, processName: 'agy.exe' },
        { host: '::1', port: 2, processName: 'agy' },
        { host: '127.0.0.1', port: 3, processName: 'agyx' }
      ])
    ).toEqual([1, 2])
  })
})
