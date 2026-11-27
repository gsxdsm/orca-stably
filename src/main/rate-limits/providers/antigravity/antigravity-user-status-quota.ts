import type {
  RateLimitBucket,
  RateLimitWindow
} from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import { deriveMostConstrainedWindow } from '../../rate-limit-bucket-summary'

// agy's per-model quota refills on a rolling 5-hour window (resetTime sits ~5h out while unused).
const ANTIGRAVITY_QUOTA_WINDOW_MINUTES = 300

export type AntigravityQuotaReading = {
  session: RateLimitWindow | null
  buckets: RateLimitBucket[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseResetsAt(value: unknown): number | null {
  if (typeof value !== 'string' || !value) {
    return null
  }
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

// "Gemini 4 Neon (High)" and "(Low)" spend one model's quota; "Orchestrator (Neon)" is its own model.
function modelFamily(label: string): string {
  return label.replace(/\s*\((?:minimal|low|medium|high|xhigh|max)\)\s*$/i, '').trim() || label
}

type ModelQuota = { family: string; usedPercent: number; resetsAt: number | null }

function readModelQuota(config: unknown): ModelQuota | null {
  if (!isRecord(config) || typeof config.label !== 'string' || !isRecord(config.quotaInfo)) {
    return null
  }
  const { remainingFraction, resetTime } = config.quotaInfo
  // proto3 JSON omits zero, so an exhausted model arrives with only its resetTime.
  const fraction = remainingFraction === undefined ? 0 : remainingFraction
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) {
    return null
  }
  return {
    family: modelFamily(config.label),
    usedPercent: Math.min(100, Math.max(0, Math.round((1 - fraction) * 100))),
    resetsAt: parseResetsAt(resetTime)
  }
}

/** Reads GetUserStatus' per-model quota; null when the payload carries no model quota at all. */
export function parseAntigravityUserStatusQuota(payload: unknown): AntigravityQuotaReading | null {
  const configs =
    isRecord(payload) &&
    isRecord(payload.userStatus) &&
    isRecord(payload.userStatus.cascadeModelConfigData) &&
    Array.isArray(payload.userStatus.cascadeModelConfigData.clientModelConfigs)
      ? payload.userStatus.cascadeModelConfigData.clientModelConfigs
      : null
  if (!configs) {
    return null
  }
  // First-seen order keeps each bucket's history key stable across readings.
  const families = new Map<string, RateLimitBucket>()
  for (const config of configs) {
    const quota = readModelQuota(config)
    if (!quota) {
      continue
    }
    const existing = families.get(quota.family)
    if (existing && existing.usedPercent >= quota.usedPercent) {
      continue
    }
    families.set(quota.family, {
      name: quota.family,
      usedPercent: quota.usedPercent,
      windowMinutes: ANTIGRAVITY_QUOTA_WINDOW_MINUTES,
      resetsAt: quota.resetsAt,
      resetDescription: null
    })
  }
  const buckets = [...families.values()]
  return { session: deriveMostConstrainedWindow(buckets), buckets }
}
