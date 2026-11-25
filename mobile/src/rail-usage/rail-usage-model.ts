import type { AccountsSnapshot } from '../accounts/accounts-snapshot'
import {
  selectProviderUsage,
  USAGE_PROVIDER_NAMES,
  type AgentUsage,
  type UsageProviderKey,
  type UsageWindowEntry
} from '../composer-usage/agent-usage-provider'
import type { UsagePace } from '../composer-usage/usage-window-pace'

const RAIL_USAGE_PROVIDERS = Object.keys(USAGE_PROVIDER_NAMES).filter(
  (key): key is UsageProviderKey => key in USAGE_PROVIDER_NAMES
)

/** Every provider the host reports usage windows for, in the composer's provider order. */
export function listRailUsage(snapshot: AccountsSnapshot | null): AgentUsage[] {
  return RAIL_USAGE_PROVIDERS.flatMap((provider) => {
    const usage = selectProviderUsage(snapshot, provider)
    return usage ? [usage] : []
  })
}

/** Weekly when the plan has one, else the window closest to its limit. */
export function pickRailUsageWindow(windows: readonly UsageWindowEntry[]): UsageWindowEntry | null {
  const weekly = windows.find((entry) => entry.kind === 'weekly')
  if (weekly) {
    return weekly
  }
  let tightest: UsageWindowEntry | null = null
  for (const entry of windows) {
    if (!tightest || entry.window.usedPercent > tightest.window.usedPercent) {
      tightest = entry
    }
  }
  return tightest
}

export type RailUsageTone = 'under' | 'on-pace' | 'ahead' | 'over' | 'unpaced'

/** Same reading as the sheet's pace line: ahead turns red once the burn would run out before reset. */
export function railUsageTone(pace: UsagePace): RailUsageTone {
  switch (pace.kind) {
    case 'unknown':
      return 'unpaced'
    case 'exhausted':
      return 'over'
    case 'on-pace':
      return 'on-pace'
    case 'under':
      return 'under'
    case 'ahead':
      return pace.runOutBeforeResetMs === null ? 'ahead' : 'over'
  }
}

/** Glyph for a provider: the agent icon of the CLI that spends its quota. */
export const RAIL_USAGE_PROVIDER_AGENT: Record<UsageProviderKey, string> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  opencodeGo: 'opencode',
  kimi: 'kimi',
  antigravity: 'antigravity',
  grok: 'grok',
  cursor: 'cursor',
  minimax: 'minimax',
  zcode: 'zcode',
  muse: 'muse'
}

/** The ring opens at the bottom for the window label, like the status glyph's signal dots. */
const RING_GAP_DEGREES = 60
/** And breaks at the top for the percent, which the fill passes behind. */
const RING_LABEL_HOLE_DEGREES = 80
const RING_SWEEP_DEGREES = 360 - RING_GAP_DEGREES
const RING_START_DEGREES = 180 + RING_GAP_DEGREES / 2
const HOLE_FROM = (360 - RING_LABEL_HOLE_DEGREES / 2 - RING_START_DEGREES) / RING_SWEEP_DEGREES
const HOLE_TO = (360 + RING_LABEL_HOLE_DEGREES / 2 - RING_START_DEGREES) / RING_SWEEP_DEGREES

/** A point `fraction` of the way clockwise along the ring's sweep, which starts at 7 o'clock. */
export function railRingPoint(
  center: number,
  radius: number,
  fraction: number
): { x: number; y: number } {
  const degrees = RING_START_DEGREES + Math.max(0, Math.min(1, fraction)) * RING_SWEEP_DEGREES
  const radians = (degrees * Math.PI) / 180
  return { x: center + radius * Math.sin(radians), y: center - radius * Math.cos(radians) }
}

/** Whether `fraction` falls in the break the percent sits in. */
export function inRailRingLabelHole(fraction: number): boolean {
  return fraction > HOLE_FROM && fraction < HOLE_TO
}

/** SVG path for the drawn part of the sweep between two fractions, skipping the label's break. */
export function railRingArc(center: number, radius: number, from: number, to: number): string {
  const spans: [number, number][] = [
    [from, Math.min(to, HOLE_FROM)],
    [Math.max(from, HOLE_TO), to]
  ]
  return spans
    .filter(([start, end]) => end > start)
    .map(([start, end]) => {
      const a = railRingPoint(center, radius, start)
      const b = railRingPoint(center, radius, end)
      const largeArc = (end - start) * RING_SWEEP_DEGREES > 180 ? 1 : 0
      return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${largeArc} 1 ${b.x} ${b.y}`
    })
    .join(' ')
}
