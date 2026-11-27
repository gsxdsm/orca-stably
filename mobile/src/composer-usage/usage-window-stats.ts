import type { UsageHistorySample } from '../../../src/shared/agent-usage/rate-limits/usage-window-history'
import type { UsagePaceWindow } from './usage-window-pace'

const DAY_MS = 24 * 60 * 60_000
const HOUR_MS = 60 * 60_000

export type UsageWindowStats = {
  /** Used minus an even burn's share so far, in points; negative is under pace. */
  paceDeltaPoints: number | null
  /** What is left spread evenly until reset, in percent per `budgetPeriodMs`. */
  budgetPercent: number | null
  /** A day, or an hour for windows of a day or less, where a daily budget means little. */
  budgetPeriodMs: number
  /** Used percent at reset if the window's average rate so far holds, capped at 100. */
  projectedAtReset: number | null
  /** How far back `recentPoints` looks: a day, or an hour for windows of a day or less. */
  recentLookbackMs: number
  /** Points used over `recentLookbackMs`; null when history does not reach back that far. */
  recentPoints: number | null
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

/** Where the window sits now; null when its reset is unknown or the reading is stale. */
function windowTiming(window: UsagePaceWindow, now: number) {
  const windowMs = window.windowMinutes * 60_000
  if (window.resetsAt == null || windowMs <= 0) {
    return null
  }
  const remainingMs = window.resetsAt - now
  const elapsedMs = windowMs - remainingMs
  if (remainingMs <= 0 || elapsedMs <= 0) {
    return null
  }
  return { windowMs, remainingMs, elapsedMs, startsAt: window.resetsAt - windowMs }
}

/** Points used since `cutoff`: a window that began after it counts all its usage. */
function usedSince(
  samples: readonly UsageHistorySample[],
  used: number,
  cutoff: number,
  startsAt: number | null
): number | null {
  if (startsAt !== null && startsAt >= cutoff) {
    return used
  }
  let before: UsageHistorySample | null = null
  for (const sample of samples) {
    if (sample.at > cutoff) {
      break
    }
    before = sample
  }
  return before ? Math.max(0, used - clampPercent(before.usedPercent)) : null
}

export function computeUsageWindowStats(
  window: UsagePaceWindow,
  samples: readonly UsageHistorySample[],
  now: number
): UsageWindowStats {
  const used = clampPercent(window.usedPercent)
  const recentLookbackMs = window.windowMinutes * 60_000 > DAY_MS ? DAY_MS : HOUR_MS
  const budgetPeriodMs = recentLookbackMs
  const timing = windowTiming(window, now)
  const recentPoints = usedSince(samples, used, now - recentLookbackMs, timing?.startsAt ?? null)
  if (!timing) {
    return {
      paceDeltaPoints: null,
      budgetPercent: null,
      budgetPeriodMs,
      projectedAtReset: null,
      recentLookbackMs,
      recentPoints
    }
  }
  const expected = (timing.elapsedMs / timing.windowMs) * 100
  return {
    paceDeltaPoints: used - expected,
    budgetPercent: (100 - used) / (timing.remainingMs / budgetPeriodMs),
    budgetPeriodMs,
    projectedAtReset: clampPercent(used + (used / timing.elapsedMs) * timing.remainingMs),
    recentLookbackMs,
    recentPoints
  }
}

export type UsageChartPoint = { at: number; value: number }

export type UsageChartModel = {
  /** The x-axis: the whole window, last reset to next reset, however little history there is. */
  startsAt: number
  endsAt: number
  /** Recorded runs inside the window, oldest first; a break between runs is time nothing was read. */
  runs: UsageChartPoint[][]
  /** The first stored reading: before it the chart shows no data, not zero. */
  firstAt: number
  /** The even-burn line's values at `startsAt` and `endsAt`; null without a reset time. */
  pace: { from: number; to: number } | null
  now: number
}

// The desktop polls every 15 minutes; a missed poll or two is not a gap.
const MIN_GAP_MS = 45 * 60_000
// The store keeps about this many points per window, so its spacing grows with the window.
const STORED_POINTS_PER_WINDOW = 168

/** Longest spacing still drawn as one line: past it the desktop was not reading usage. */
export function usageChartGapMs(windowMs: number, points: readonly UsageChartPoint[]): number {
  const steps = points.slice(1).map((point, index) => point.at - (points[index]?.at ?? point.at))
  steps.sort((a, b) => a - b)
  const typical = steps[Math.floor(steps.length / 2)] ?? 0
  return Math.max(MIN_GAP_MS, (2.5 * windowMs) / STORED_POINTS_PER_WINDOW, 2.5 * typical)
}

/** The chart's domain and series, or null before the first reading in this window. */
export function buildUsageChartModel(
  window: UsagePaceWindow,
  samples: readonly UsageHistorySample[],
  now: number,
  display: 'used' | 'remaining'
): UsageChartModel | null {
  const windowMs = window.windowMinutes * 60_000
  if (windowMs <= 0) {
    return null
  }
  // Without a reset time the window is the span that ends now.
  const endsAt = window.resetsAt ?? now
  const startsAt = endsAt - windowMs
  const shown = (used: number): number =>
    display === 'remaining' ? 100 - clampPercent(used) : clampPercent(used)
  const points = samples
    .filter((sample) => sample.at >= startsAt && sample.at <= Math.min(now, endsAt))
    .map((sample) => ({ at: sample.at, value: shown(sample.usedPercent) }))
  const first = points[0]
  if (!first) {
    return null
  }
  const gapMs = usageChartGapMs(windowMs, points)
  const runs: UsageChartPoint[][] = []
  let run: UsageChartPoint[] = []
  for (const point of points) {
    const previous = run.at(-1)
    if (previous && point.at - previous.at > gapMs) {
      runs.push(run)
      run = []
    }
    run.push(point)
  }
  runs.push(run)
  return {
    startsAt,
    endsAt,
    runs,
    firstAt: first.at,
    pace: window.resetsAt != null ? { from: shown(0), to: shown(100) } : null,
    now: Math.min(Math.max(now, startsAt), endsAt)
  }
}
