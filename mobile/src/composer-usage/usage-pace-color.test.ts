import { describe, expect, it } from 'vitest'
import { usageBandColor } from '../accounts/usage/usage-band-color'
import { getMobilePalette } from '../theme/mobile-theme'

const colors = getMobilePalette()
import { composerUsageMeterReadout } from './composer-usage-meter-readout'
import {
  DEFAULT_USAGE_PACE_COLOR_THRESHOLDS,
  normalizeUsagePaceColorThresholds,
  parseUsagePaceColorThresholds,
  serializeUsagePaceColorThresholds,
  updateGreenPaceThreshold,
  updateYellowPaceThreshold,
  usagePaceColor,
  usagePaceColorBand,
  usageWindowPaceColor
} from './usage-pace-color'

const HOUR = 3_600_000
const NOW = 1_800_000_000_000

// A 5h window 2h in: an even burn expects exactly 40% used.
function fiveHourWindow(usedPercent: number, resetsAt: number | null = NOW + 3 * HOUR) {
  return {
    usedPercent,
    windowMinutes: 300,
    resetsAt
  }
}

describe('usagePaceColorBand & usagePaceColor boundary conditions', () => {
  it('classifies exact default boundaries (-20, 0, +5, +5.1, +10, +10.1)', () => {
    const expected = 40
    expect(usagePaceColorBand(expected - 20, expected)).toBe('green')
    expect(usagePaceColorBand(expected, expected)).toBe('green')
    expect(usagePaceColorBand(expected + 5, expected)).toBe('green')
    expect(usagePaceColorBand(expected + 5.1, expected)).toBe('yellow')
    expect(usagePaceColorBand(expected + 10, expected)).toBe('yellow')
    expect(usagePaceColorBand(expected + 10.1, expected)).toBe('red')

    expect(usagePaceColor(expected - 20, expected)).toBe(colors.statusGreen)
    expect(usagePaceColor(expected, expected)).toBe(colors.statusGreen)
    expect(usagePaceColor(expected + 5, expected)).toBe(colors.statusGreen)
    expect(usagePaceColor(expected + 5.1, expected)).toBe(colors.statusAmber)
    expect(usagePaceColor(expected + 10, expected)).toBe(colors.statusAmber)
    expect(usagePaceColor(expected + 10.1, expected)).toBe(colors.statusRed)
  })

  it('handles IEEE-754 subtraction drift cleanly at exact boundaries', () => {
    // 20.1 - 15.1 === 5.000000000000002 in JS; should still count as <= 5 (green).
    expect(usagePaceColorBand(20.1, 15.1)).toBe('green')
    expect(usagePaceColorBand(25.1, 15.1)).toBe('yellow')
  })

  it('honors custom configured thresholds (e.g. 3% green / 8% yellow)', () => {
    const custom = { greenMaxOverPacePct: 3, yellowMaxOverPacePct: 8 }
    expect(usagePaceColor(43, 40, custom)).toBe(colors.statusGreen)
    expect(usagePaceColor(43.1, 40, custom)).toBe(colors.statusAmber)
    expect(usagePaceColor(48, 40, custom)).toBe(colors.statusAmber)
    expect(usagePaceColor(48.1, 40, custom)).toBe(colors.statusRed)
  })

  it('supports zero-width yellow band when green equals yellow', () => {
    const tight = { greenMaxOverPacePct: 5, yellowMaxOverPacePct: 5 }
    expect(usagePaceColorBand(45, 40, tight)).toBe('green')
    expect(usagePaceColorBand(45.1, 40, tight)).toBe('red')
  })

  it('falls back to consumption band color when expected pace or reset time is unavailable', () => {
    expect(usagePaceColorBand(30, null)).toBeNull()
    expect(usagePaceColor(30, null)).toBe(usageBandColor(30))
    expect(usagePaceColor(70, null)).toBe(usageBandColor(70))
    expect(usagePaceColor(90, null)).toBe(usageBandColor(90))
    expect(usagePaceColor(null, 40)).toBe(usageBandColor(null))

    expect(usageWindowPaceColor(fiveHourWindow(30, null), NOW)).toBe(colors.statusGreen)
    expect(usageWindowPaceColor(fiveHourWindow(70, null), NOW)).toBe(colors.statusAmber)
    expect(usageWindowPaceColor(fiveHourWindow(85, null), NOW)).toBe(colors.statusRed)
    // Stale reset in the past also falls back gracefully.
    expect(usageWindowPaceColor(fiveHourWindow(70, NOW - 1), NOW)).toBe(colors.statusAmber)
  })
})

describe('usageWindowPaceColor across side rail rings and composer meter', () => {
  it('produces identical colors across green, yellow, red, and exhausted windows regardless of display mode', () => {
    const thresholds = { greenMaxOverPacePct: 5, yellowMaxOverPacePct: 10 }
    const cases = [
      { used: 20, expectedColor: colors.statusGreen },
      { used: 45, expectedColor: colors.statusGreen },
      { used: 45.1, expectedColor: colors.statusAmber },
      { used: 50, expectedColor: colors.statusAmber },
      { used: 50.1, expectedColor: colors.statusRed },
      { used: 100, expectedColor: colors.statusRed }
    ]
    for (const { used, expectedColor } of cases) {
      const window = fiveHourWindow(used)
      // Side rail ring & composer meter both call usageWindowPaceColor with the raw window.
      const color = usageWindowPaceColor(window, NOW, thresholds)
      expect(color).toBe(expectedColor)
      // Display mode ('used' vs 'remaining') changes only shown %, never pace color.
      const usedReadout = composerUsageMeterReadout(window.usedPercent, 'used')
      const remainingReadout = composerUsageMeterReadout(window.usedPercent, 'remaining')
      expect(usedReadout.shown + remainingReadout.shown).toBe(100)
      expect(usageWindowPaceColor(window, NOW, thresholds)).toBe(expectedColor)
    }
  })

  it('recomputes immediately when thresholds change', () => {
    const window = fiveHourWindow(46) // +6% over 40% expected pace
    expect(
      usageWindowPaceColor(window, NOW, { greenMaxOverPacePct: 5, yellowMaxOverPacePct: 10 })
    ).toBe(colors.statusAmber)
    expect(
      usageWindowPaceColor(window, NOW, { greenMaxOverPacePct: 8, yellowMaxOverPacePct: 12 })
    ).toBe(colors.statusGreen)
    expect(
      usageWindowPaceColor(window, NOW, { greenMaxOverPacePct: 2, yellowMaxOverPacePct: 5 })
    ).toBe(colors.statusRed)
  })
})

describe('threshold normalization and preference serialization', () => {
  it('keeps yellow >= green and clamps within bounds', () => {
    expect(normalizeUsagePaceColorThresholds(null)).toEqual(DEFAULT_USAGE_PACE_COLOR_THRESHOLDS)
    expect(
      normalizeUsagePaceColorThresholds({ greenMaxOverPacePct: 12, yellowMaxOverPacePct: 8 })
    ).toEqual({ greenMaxOverPacePct: 12, yellowMaxOverPacePct: 12 })
    expect(
      normalizeUsagePaceColorThresholds({ greenMaxOverPacePct: -5, yellowMaxOverPacePct: 99 })
    ).toEqual({ greenMaxOverPacePct: 0, yellowMaxOverPacePct: 50 })

    expect(
      updateGreenPaceThreshold({ greenMaxOverPacePct: 5, yellowMaxOverPacePct: 8 }, 10)
    ).toEqual({ greenMaxOverPacePct: 10, yellowMaxOverPacePct: 10 })
    expect(
      updateYellowPaceThreshold({ greenMaxOverPacePct: 8, yellowMaxOverPacePct: 10 }, 4)
    ).toEqual({ greenMaxOverPacePct: 4, yellowMaxOverPacePct: 4 })
  })

  it('round-trips serialized thresholds and recovers defaults on invalid storage', () => {
    const raw = serializeUsagePaceColorThresholds({
      greenMaxOverPacePct: 3,
      yellowMaxOverPacePct: 8
    })
    expect(parseUsagePaceColorThresholds(raw)).toEqual({
      greenMaxOverPacePct: 3,
      yellowMaxOverPacePct: 8
    })
    expect(parseUsagePaceColorThresholds(null)).toEqual(DEFAULT_USAGE_PACE_COLOR_THRESHOLDS)
    expect(parseUsagePaceColorThresholds('not-json')).toEqual(DEFAULT_USAGE_PACE_COLOR_THRESHOLDS)
  })
})
