import { describe, expect, it, vi } from 'vitest'
import { readAntigravityStatusLineUsage } from '../../../shared/agent-usage/rate-limits/antigravity-statusline-usage'
import type { AntigravityUsageSource } from '../../../shared/agent-usage/rate-limits/antigravity-usage-source'
import * as fetcher from '../providers/antigravity/antigravity-usage-fetcher'
import { UsageHistoryRecorder } from '../usage-history/usage-history-recorder'
import { RateLimitService } from './rate-limit-service'

const NOW = Date.now()
const RESET_5H = new Date(NOW + 4 * 60 * 60_000).toISOString()
const RESET_WEEKLY = new Date(NOW + 6 * 24 * 60 * 60_000).toISOString()

describe('RateLimitService Antigravity usage sources', () => {
  it('makes ZERO ACP fetcher calls in statusline-only mode and ingests passive status-line readings into state + history', async () => {
    const fetchSpy = vi.spyOn(fetcher, 'fetchAntigravityRateLimits')
    const service = new RateLimitService()
    const history = new UsageHistoryRecorder(null)
    await history.loaded
    service.setUsageHistoryRecorder(history)
    service.setAntigravityUsageSourceResolver(() => 'statusline')

    const statusLineReading = readAntigravityStatusLineUsage(
      {
        email: 'owner@example.com',
        quota: {
          'gemini-5h': { remaining_fraction: 0.75, reset_time: RESET_5H },
          'gemini-weekly': { remaining_fraction: 0.6, reset_time: RESET_WEEKLY }
        }
      },
      NOW
    )!
    service.ingestLiveAntigravityRateLimits(statusLineReading)

    const state = await service.getState()
    expect(state.antigravity?.status).toBe('ok')
    expect(state.antigravity?.session?.usedPercent).toBe(25)
    expect(state.antigravity?.weekly?.usedPercent).toBe(40)
    expect(state.usageHistory?.['antigravity:session']?.samples).toHaveLength(1)
    expect(state.usageHistory?.['antigravity:weekly']?.samples).toHaveLength(1)

    // Even switching into statusline mode and preparing a refresh must never call the ACP fetcher.
    service.applyAntigravityUsageSourceChange('statusline')
    const afterSwitch = await service.getState()
    expect(afterSwitch.antigravity?.weekly?.usedPercent).toBe(40)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('ignores status-line readings in acp-only mode and merges freshest readings in both mode', async () => {
    let mode: AntigravityUsageSource = 'acp'
    const service = new RateLimitService()
    service.setAntigravityUsageSourceResolver(() => mode)

    const liveReading = readAntigravityStatusLineUsage(
      {
        email: 'owner@example.com',
        quota: {
          'gemini-5h': { remaining_fraction: 0.5, reset_time: RESET_5H },
          'gemini-weekly': { remaining_fraction: 0.8, reset_time: RESET_WEEKLY }
        }
      },
      NOW
    )!
    service.ingestLiveAntigravityRateLimits(liveReading)
    expect((await service.getState()).antigravity).toBeNull()

    mode = 'both'
    service.ingestLiveAntigravityRateLimits(liveReading)
    const state = await service.getState()
    expect(state.antigravity?.session?.usedPercent).toBe(50)
    expect(state.antigravity?.weekly?.usedPercent).toBe(20)

    // Switching back to acp-only discards the live-session-only reading.
    mode = 'acp'
    service.applyAntigravityUsageSourceChange('acp')
    expect((await service.getState()).antigravity).toBeNull()
  })
})
