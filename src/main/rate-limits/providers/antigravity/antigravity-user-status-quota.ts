import type {
  RateLimitBucket,
  RateLimitWindow
} from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import {
  ANTIGRAVITY_SESSION_WINDOW_MINUTES,
  describeAntigravityBucketId,
  summarizeAntigravityBuckets
} from '../../../../shared/agent-usage/rate-limits/antigravity-statusline-usage'
import { deriveMostConstrainedWindow } from '../../rate-limit-bucket-summary'

export type AntigravityQuotaReading = {
  session: RateLimitWindow | null
  weekly: RateLimitWindow | null
  buckets: RateLimitBucket[]
  /** True when the server returned a valid empty quota summary before any usage was recorded. */
  noUsageYet?: boolean
  email?: string | null
  planType?: string | null
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

/**
 * Reads `RetrieveUserQuotaSummary`, which returns both weekly and 5-hour quota buckets
 * grouped by model pool (Gemini Models, Claude and GPT models).
 */
export function parseAntigravityQuotaSummary(payload: unknown): AntigravityQuotaReading | null {
  if (!isRecord(payload)) {
    return null
  }
  const container = isRecord(payload.response) ? payload.response : payload
  if (!Array.isArray(container.groups)) {
    return null
  }
  const entries: { id: string; order: number; bucket: RateLimitBucket }[] = []
  for (const group of container.groups) {
    if (!isRecord(group) || !Array.isArray(group.buckets)) {
      continue
    }
    const groupDisplayName =
      typeof group.displayName === 'string' && group.displayName.trim()
        ? group.displayName.trim()
        : null
    for (const raw of group.buckets) {
      if (!isRecord(raw) || raw.disabled === true) {
        continue
      }
      const id =
        typeof raw.bucketId === 'string' && raw.bucketId.trim()
          ? raw.bucketId.trim()
          : typeof raw.id === 'string' && raw.id.trim()
            ? raw.id.trim()
            : null
      if (!id) {
        continue
      }
      const { remainingFraction, resetTime } = raw
      // proto3 JSON omits zero, so an exhausted bucket arrives with only its resetTime.
      const fraction =
        remainingFraction === undefined && typeof resetTime === 'string' ? 0 : remainingFraction
      if (typeof fraction !== 'number' || !Number.isFinite(fraction)) {
        continue
      }
      const explicitWindow = typeof raw.window === 'string' ? raw.window : undefined
      const described = describeAntigravityBucketId(id, explicitWindow)
      const name =
        described.order < 100 || !groupDisplayName
          ? described.name
          : explicitWindow
            ? `${groupDisplayName} ${explicitWindow}`
            : groupDisplayName
      entries.push({
        id,
        order: described.order,
        bucket: {
          name,
          windowMinutes: described.windowMinutes,
          usedPercent: Math.min(100, Math.max(0, Math.round((1 - fraction) * 100))),
          resetsAt: parseResetsAt(resetTime),
          resetDescription: null
        }
      })
    }
  }
  if (entries.length === 0) {
    return { session: null, weekly: null, buckets: [], noUsageYet: true }
  }
  entries.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  return summarizeAntigravityBuckets(entries.map((entry) => entry.bucket))
}

/** Fallback for older agy builds: reads GetUserStatus' per-model 5-hour quota. */
export function parseAntigravityUserStatusQuota(payload: unknown): AntigravityQuotaReading | null {
  const userStatus = isRecord(payload) && isRecord(payload.userStatus) ? payload.userStatus : null
  const configs =
    userStatus &&
    isRecord(userStatus.cascadeModelConfigData) &&
    Array.isArray(userStatus.cascadeModelConfigData.clientModelConfigs)
      ? userStatus.cascadeModelConfigData.clientModelConfigs
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
      windowMinutes: ANTIGRAVITY_SESSION_WINDOW_MINUTES,
      resetsAt: quota.resetsAt,
      resetDescription: null
    })
  }
  const buckets = [...families.values()]
  const email =
    typeof userStatus?.email === 'string' && userStatus.email.trim()
      ? userStatus.email.trim()
      : null
  const planInfo =
    isRecord(userStatus?.planStatus) && isRecord(userStatus.planStatus.planInfo)
      ? userStatus.planStatus.planInfo
      : null
  const planType =
    typeof planInfo?.planName === 'string' && planInfo.planName.trim()
      ? planInfo.planName.trim()
      : null
  return {
    session: deriveMostConstrainedWindow(buckets),
    weekly: null,
    buckets,
    ...(email ? { email } : {}),
    ...(planType ? { planType } : {})
  }
}
