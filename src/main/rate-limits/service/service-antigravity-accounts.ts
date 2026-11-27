import type {
  ProviderRateLimits,
  RateLimitRuntimeTarget
} from '../../../shared/agent-usage/rate-limits/rate-limit-types'
import {
  antigravityUsageReadsStatusLine,
  normalizeAntigravityUsageSource,
  pickFresherAntigravityReading,
  type AntigravityUsageSource
} from '../../../shared/agent-usage/rate-limits/antigravity-usage-source'
import type {
  AntigravityAccountUsageRecorder,
  AntigravityUsageReadStart
} from '../providers/antigravity/antigravity-account-usage'
import { RateLimitServiceFetchPolicy } from './service-fetch-policy'
import { hasUsageWindows, withoutResetWindows } from './service-result-policy'

type AntigravityAccountRead = AntigravityUsageReadStart & { target: RateLimitRuntimeTarget }

export abstract class RateLimitServiceAntigravityAccounts extends RateLimitServiceFetchPolicy {
  protected getAntigravityUsageSource(): AntigravityUsageSource {
    return normalizeAntigravityUsageSource(this.antigravityUsageSourceResolver?.())
  }

  protected antigravityUsageWithoutAcp(now: number = Date.now()): ProviderRateLimits {
    const candidate =
      this.liveAntigravityUsage ??
      (this.state.antigravity?.usageMetadata?.source === 'live-session'
        ? this.state.antigravity
        : null)
    const current = candidate ? withoutResetWindows(candidate, now) : null
    if (current && hasUsageWindows(current)) {
      return current
    }
    return {
      provider: 'antigravity',
      session: null,
      weekly: null,
      updatedAt: now,
      error: 'Waiting for an interactive agy terminal to report usage via status line.',
      status: 'unavailable',
      usageMetadata: {
        source: 'live-session',
        attemptedSources: ['live-session'],
        failureKind: 'cli-unavailable'
      }
    }
  }

  ingestLiveAntigravityRateLimits(reading: ProviderRateLimits): void {
    const source = this.getAntigravityUsageSource()
    if (!antigravityUsageReadsStatusLine(source)) {
      return
    }
    const now = Date.now()
    const priorLive = this.liveAntigravityUsage
      ? withoutResetWindows(this.liveAntigravityUsage, now)
      : null
    const nextLive =
      pickFresherAntigravityReading(
        priorLive && hasUsageWindows(priorLive) ? priorLive : null,
        reading,
        now
      ) ?? reading
    this.liveAntigravityUsage = nextLive
    const previous = this.state.antigravity
    const previousCurrent = previous ? withoutResetWindows(previous, now) : null
    const merged =
      source === 'statusline'
        ? nextLive
        : (pickFresherAntigravityReading(
            previousCurrent && hasUsageWindows(previousCurrent) ? previousCurrent : null,
            nextLive,
            now
          ) ?? nextLive)
    this.activeFailureStreakByProvider.antigravity = 0
    this.updateState({
      ...this.state,
      antigravity: merged
    })
    const recorder = this.antigravityAccountUsageRecorder
    if (!recorder || merged.status !== 'ok') {
      return
    }
    const target = this.antigravityFetchTarget
    const generation = this.antigravityFetchGeneration
    void recorder
      .begin(target)
      .then(async (read) => {
        if (!read?.login || generation !== this.antigravityFetchGeneration) {
          return
        }
        const incomingEmail = merged.usageMetadata?.account?.email?.trim().toLowerCase()
        const loginEmail = read.login.email?.trim().toLowerCase()
        if (incomingEmail && loginEmail && incomingEmail !== loginEmail) {
          return
        }
        const finish = await recorder.finish(target, read.login, merged)
        if (finish.switched || generation !== this.antigravityFetchGeneration) {
          return
        }
        this.antigravityAccounts = finish.accounts
        if (this.state.antigravity === merged) {
          this.updateState({
            ...this.state,
            antigravity: {
              ...merged,
              usageMetadata: { ...merged.usageMetadata, account: finish.account }
            }
          })
        }
      })
      .catch(() => {})
  }
  protected async beginAntigravityAccountRead(
    recorder: AntigravityAccountUsageRecorder
  ): Promise<AntigravityAccountRead | null> {
    const target = this.antigravityFetchTarget
    try {
      const read = await recorder.begin(target)
      if (target !== this.antigravityFetchTarget) {
        // Retargeted mid-read: these accounts belong to the previous runtime.
        return null
      }
      this.antigravityAccounts = read?.accounts ?? []
      return read && { ...read, target }
    } catch {
      // Unverifiable identity leaves the live reading unattributed, as before accounts existed.
      return null
    }
  }

  protected async attributeAntigravityReading(
    read: AntigravityAccountRead | null,
    generation: number,
    limits: ProviderRateLimits
  ): Promise<ProviderRateLimits> {
    const recorder = this.antigravityAccountUsageRecorder
    if (!read?.login || !recorder) {
      return limits
    }
    let finish
    try {
      finish = await recorder.finish(read.target, read.login, limits)
    } catch {
      return limits
    }
    if (generation !== this.antigravityFetchGeneration) {
      return limits
    }
    if (finish.switched) {
      // The reading may belong to either login, so drop it rather than misattribute it.
      this.antigravityFetchGeneration += 1
      this.updateState({ ...this.state, antigravity: null })
      return limits
    }
    this.antigravityAccounts = finish.accounts
    return { ...limits, usageMetadata: { ...limits.usageMetadata, account: finish.account } }
  }
}
