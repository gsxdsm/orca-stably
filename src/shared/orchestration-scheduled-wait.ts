const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000
}

export function parseScheduledWaitUntil(value: string, now = Date.now()): string {
  const duration = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(value)
  const timestamp = duration
    ? now + Number(duration[1]) * DURATION_UNITS[duration[2]]
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      ? Date.parse(value)
      : Number.NaN
  if (!Number.isFinite(timestamp) || timestamp <= now || timestamp > 8_640_000_000_000_000) {
    throw new Error(
      'wait-until must be a future ISO timestamp with timezone or a positive duration (30s, 5m, 4h, 1d).'
    )
  }
  return new Date(timestamp).toISOString()
}
