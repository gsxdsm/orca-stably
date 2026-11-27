import type { ProviderRateLimits, RateLimitBucket, RateLimitWindow } from './rate-limit-types'

// agy pipes this JSON to its statusLine command on every agent state change
// (https://antigravity.google/docs/cli/statusline#available-json-fields).
export const ANTIGRAVITY_STATUSLINE_PATHNAME = '/statusline/antigravity'

// agy runs the command at most every 300ms; the client posts at most this often per terminal.
export const ANTIGRAVITY_STATUSLINE_MIN_POST_INTERVAL_SECONDS = 15

export const ANTIGRAVITY_SESSION_WINDOW_MINUTES = 300
export const ANTIGRAVITY_WEEKLY_WINDOW_MINUTES = 10_080
export const ANTIGRAVITY_DAILY_WINDOW_MINUTES = 1_440

export const ANTIGRAVITY_NO_USAGE_YET_NOTICE =
  'Antigravity has no usage data for this window yet; it appears after your first Antigravity turn'

// Bucket ids are agy's own, e.g. `gemini-weekly`, `gemini-5h`, `3p-weekly`, `3p-5h`.
const GROUP_LABELS: Readonly<Record<string, string>> = { gemini: 'Gemini', '3p': 'Claude/GPT' }
const WINDOW_MINUTES: Readonly<Record<string, number>> = {
  '5h': ANTIGRAVITY_SESSION_WINDOW_MINUTES,
  weekly: ANTIGRAVITY_WEEKLY_WINDOW_MINUTES,
  daily: ANTIGRAVITY_DAILY_WINDOW_MINUTES
}
// Canonical order keeps bucket history keys stable across ACP and status-line readings.
const CANONICAL_BUCKET_ORDER: Readonly<Record<string, number>> = {
  'gemini-5h': 0,
  'gemini-weekly': 1,
  '3p-5h': 2,
  '3p-weekly': 3
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function titleCase(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text
}

export function describeAntigravityBucketId(
  id: string,
  explicitWindow?: string
): { name: string; windowMinutes: number; order: number } {
  const dash = id.lastIndexOf('-')
  const group = dash > 0 ? id.slice(0, dash) : id
  const suffix = dash > 0 ? id.slice(dash + 1) : ''
  const windowKey = explicitWindow?.trim().toLowerCase() || suffix.toLowerCase()
  const groupLabel = GROUP_LABELS[group] ?? titleCase(group.replace(/[-_]+/g, ' '))
  // An unknown window keeps agy's own wording and length 0 rather than an invented one.
  return {
    name: windowKey ? `${groupLabel} ${windowKey}` : groupLabel,
    windowMinutes: WINDOW_MINUTES[windowKey] ?? 0,
    order: CANONICAL_BUCKET_ORDER[id] ?? 100
  }
}

export function antigravityTightestWindow(
  buckets: readonly RateLimitBucket[]
): RateLimitWindow | null {
  if (buckets.length === 0) {
    return null
  }
  const { usedPercent, windowMinutes, resetsAt, resetDescription } = buckets.reduce((a, b) =>
    b.usedPercent > a.usedPercent ? b : a
  )
  return { usedPercent, windowMinutes, resetsAt, resetDescription }
}

export function summarizeAntigravityBuckets(orderedBuckets: readonly RateLimitBucket[]): {
  session: RateLimitWindow | null
  weekly: RateLimitWindow | null
  buckets: RateLimitBucket[]
} {
  const buckets = [...orderedBuckets]
  const sessions = buckets.filter(
    (bucket) => bucket.windowMinutes === ANTIGRAVITY_SESSION_WINDOW_MINUTES
  )
  const weeklies = buckets.filter(
    (bucket) => bucket.windowMinutes === ANTIGRAVITY_WEEKLY_WINDOW_MINUTES
  )
  return {
    session:
      antigravityTightestWindow(sessions) ??
      (weeklies.length === 0 ? antigravityTightestWindow(buckets) : null),
    weekly: antigravityTightestWindow(weeklies),
    buckets
  }
}

export function antigravityNoUsageYetReading(
  now: number,
  source: 'cli' | 'live-session' = 'cli'
): ProviderRateLimits {
  return {
    provider: 'antigravity',
    session: {
      usedPercent: 0,
      windowMinutes: ANTIGRAVITY_SESSION_WINDOW_MINUTES,
      resetsAt: null,
      resetDescription: null
    },
    weekly: {
      usedPercent: 0,
      windowMinutes: ANTIGRAVITY_WEEKLY_WINDOW_MINUTES,
      resetsAt: null,
      resetDescription: null
    },
    updatedAt: now,
    error: null,
    notice: ANTIGRAVITY_NO_USAGE_YET_NOTICE,
    status: 'ok',
    usageMetadata: {
      source,
      attemptedSources: [source],
      lastSuccessfulSource: source,
      credentialSource: 'antigravity-cli'
    }
  }
}

function parseStatusLineBucket(
  id: string,
  raw: unknown,
  now: number
): { bucket: RateLimitBucket; order: number; id: string } | null {
  // Disabled means unmetered; drawing it as unused would invent headroom.
  if (!isRecord(raw) || raw.disabled === true) {
    return null
  }
  const fraction = finite(raw.remaining_fraction)
  // remaining_amount alone has no total to turn into a percentage.
  if (fraction === null) {
    return null
  }
  const resetTime = typeof raw.reset_time === 'string' ? Date.parse(raw.reset_time) : Number.NaN
  const resetIn = finite(raw.reset_in_seconds)
  const resetsAt = Number.isFinite(resetTime)
    ? resetTime
    : resetIn !== null
      ? now + resetIn * 1000
      : null
  const { name, windowMinutes, order } = describeAntigravityBucketId(id)
  return {
    id,
    order,
    bucket: {
      name,
      windowMinutes,
      usedPercent: Math.min(100, Math.max(0, Math.round((1 - fraction) * 100))),
      resetsAt,
      resetDescription: null
    }
  }
}

/** A reading from one status-line payload; null when it carries no usable quota. */
export function readAntigravityStatusLineUsage(
  payload: unknown,
  now: number
): ProviderRateLimits | null {
  if (!isRecord(payload) || !isRecord(payload.quota)) {
    return null
  }
  const parsed = Object.entries(payload.quota).flatMap(([id, raw]) => {
    const entry = parseStatusLineBucket(id, raw, now)
    return entry ? [entry] : []
  })
  if (parsed.length === 0) {
    return null
  }
  parsed.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  const { session, weekly, buckets } = summarizeAntigravityBuckets(
    parsed.map((entry) => entry.bucket)
  )
  const email =
    typeof payload.email === 'string' && payload.email.trim() ? payload.email.trim() : null
  const planType =
    typeof payload.plan_tier === 'string' && payload.plan_tier.trim()
      ? payload.plan_tier.trim()
      : null
  return {
    provider: 'antigravity',
    session,
    weekly,
    buckets,
    ...(planType ? { planType } : {}),
    updatedAt: now,
    error: null,
    status: 'ok',
    usageMetadata: {
      source: 'live-session',
      attemptedSources: ['live-session'],
      lastSuccessfulSource: 'live-session',
      credentialSource: 'antigravity-cli',
      authProvenance: 'host',
      ...(email ? { account: { id: null, email } } : {})
    }
  }
}
