import { describe, expect, it } from 'vitest'
import {
  WIDE_METER_MIN_ROOM,
  WIDE_PANE_MIN_WIDTH,
  composerUsagePaneAllowsWideMeter,
  composerUsageWideMeterLayout,
  composerUsageWideMeterWidth
} from './composer-usage-wide-meter'

const wideLabels = {
  fullLabelWidth: 44,
  percentWidth: 52,
  gap: 8
}

describe('composerUsageWideMeterLayout', () => {
  it('stays compact on folded Duo cover screen even when slot room is generous', () => {
    expect(composerUsagePaneAllowsWideMeter(466)).toBe(false)
    expect(composerUsageWideMeterWidth(220, 466)).toBeNull()
    expect(
      composerUsageWideMeterLayout({
        room: 220,
        paneWidth: 466,
        ...wideLabels
      })
    ).toBeNull()
  })

  it('stays compact in Split View on unfolded Duo and narrow iPad splits', () => {
    // Partially Open book split (~455.5pt), Open flat w/ sidebar (~611pt),
    // iPad Slide Over (~375pt), iPad 11" portrait w/ sidebar (~494pt), iPad 11" 50/50 (~597pt).
    for (const paneWidth of [375, 455.5, 494, 527, 597, 611, WIDE_PANE_MIN_WIDTH - 1]) {
      expect(composerUsagePaneAllowsWideMeter(paneWidth)).toBe(false)
      expect(
        composerUsageWideMeterLayout({
          room: 260,
          paneWidth,
          ...wideLabels
        })
      ).toBeNull()
    }
  })

  it('stays compact while pane width has not been measured yet', () => {
    expect(composerUsagePaneAllowsWideMeter(null)).toBe(false)
    expect(
      composerUsageWideMeterLayout({
        room: 300,
        paneWidth: null,
        ...wideLabels
      })
    ).toBeNull()
  })

  it('uses the wide meter with full reset label on full-screen unfolded Duo', () => {
    // Full-screen unfolded Duo: ~867pt clear of side column, ~951pt spanning side column.
    expect(composerUsagePaneAllowsWideMeter(867)).toBe(true)
    expect(composerUsagePaneAllowsWideMeter(951)).toBe(true)
    expect(
      composerUsageWideMeterLayout({
        room: 380,
        paneWidth: 951,
        ...wideLabels
      })
    ).toEqual({ width: 285, label: 'full' })
  })

  it('uses the wide meter on full-screen iPad panes', () => {
    // iPad 13" portrait w/ sidebar (~684pt), iPad mini landscape (~723pt), iPad 11" (~798pt), iPad 13" (~956pt).
    for (const paneWidth of [WIDE_PANE_MIN_WIDTH, 684, 723, 798, 956, 1296]) {
      expect(composerUsagePaneAllowsWideMeter(paneWidth)).toBe(true)
      expect(
        composerUsageWideMeterLayout({
          room: 340,
          paneWidth,
          ...wideLabels
        })
      ).toEqual({ width: 255, label: 'full' })
    }
  })

  it('falls back to compact on a wide pane when slot room is crowded', () => {
    expect(
      composerUsageWideMeterLayout({
        room: WIDE_METER_MIN_ROOM - 1,
        paneWidth: 951,
        ...wideLabels
      })
    ).toBeNull()
  })

  it('shortens the wide meter label to compact only when full label + min bar exceed room', () => {
    // need = ceil(44 + 52 + 16 + 60) = 172; at room=170 it keeps wide bar with compact label.
    expect(
      composerUsageWideMeterLayout({
        room: 170,
        paneWidth: 951,
        ...wideLabels
      })
    ).toEqual({ width: 140, label: 'compact' })
  })
})
