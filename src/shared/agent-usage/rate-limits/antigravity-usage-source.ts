import type { ProviderRateLimits, RateLimitWindow } from './rate-limit-types'

/** Where Orca reads Antigravity quota: a running agy's own status, interactive agy's status line, or both. */
export const ANTIGRAVITY_USAGE_SOURCES = ['both', 'acp', 'statusline'] as const

export type AntigravityUsageSource = (typeof ANTIGRAVITY_USAGE_SOURCES)[number]

export type AntigravityUsageSourceSettings = {
  /** Where Orca reads Antigravity usage: running agy acp, interactive agy status line, or both. */
  antigravityUsageSource?: AntigravityUsageSource
}

export const DEFAULT_ANTIGRAVITY_USAGE_SOURCE: AntigravityUsageSource = 'both'

export function normalizeAntigravityUsageSource(value: unknown): AntigravityUsageSource {
  return ANTIGRAVITY_USAGE_SOURCES.find((source) => source === value) ?? 'both'
}

/** Whether Orca may ask a running agy acp process for local quota status. */
export function antigravityUsageReadsAcp(source: AntigravityUsageSource): boolean {
  return source !== 'statusline'
}

/** Whether Orca installs and reads the interactive agy status-line feed. */
export function antigravityUsageReadsStatusLine(source: AntigravityUsageSource): boolean {
  return source !== 'acp'
}

function isWindowCurrent(window: RateLimitWindow | null | undefined, now: number): boolean {
  if (!window) {
    return false
  }
  return typeof window.resetsAt !== 'number' || window.resetsAt > now
}

function accountIdentity(limits: ProviderRateLimits): string | null {
  const account = limits.usageMetadata?.account
  const id = account?.id?.trim()
  if (id) {
    return `id:${id}`
  }
  const email = account?.email?.trim().toLowerCase()
  return email ? `email:${email}` : null
}

function compatibleAccounts(a: ProviderRateLimits, b: ProviderRateLimits): boolean {
  const idA = accountIdentity(a)
  const idB = accountIdentity(b)
  return !idA || !idB || idA === idB
}

/**
 * The fresher usable reading; a failed or empty reading never displaces a good one.
 * When both readings are ok for the same account and the fresher one omits either the 5h
 * session or weekly window, carry over the still-current window from the other reading so
 * neither window disappears.
 */
export function pickFresherAntigravityReading(
  a: ProviderRateLimits | null,
  b: ProviderRateLimits | null,
  now: number = Date.now()
): ProviderRateLimits | null {
  if (!a || !b) {
    return a ?? b
  }
  const aOk = a.status === 'ok'
  const bOk = b.status === 'ok'
  if (aOk !== bOk) {
    return aOk ? a : b
  }
  const fresher = b.updatedAt > a.updatedAt ? b : a
  const older = fresher === b ? a : b
  if (!aOk || !compatibleAccounts(fresher, older)) {
    return fresher
  }
  const session = fresher.session ?? (isWindowCurrent(older.session, now) ? older.session : null)
  const weekly = fresher.weekly ?? (isWindowCurrent(older.weekly, now) ? older.weekly : null)
  if (session === fresher.session && weekly === fresher.weekly) {
    return fresher
  }
  const fresherBucketNames = new Set((fresher.buckets ?? []).map((bucket) => bucket.name))
  const carriedBuckets = (older.buckets ?? []).filter(
    (bucket) => !fresherBucketNames.has(bucket.name) && isWindowCurrent(bucket, now)
  )
  return {
    ...fresher,
    session,
    weekly,
    ...(fresher.buckets || carriedBuckets.length > 0
      ? { buckets: [...(fresher.buckets ?? []), ...carriedBuckets] }
      : {})
  }
}
