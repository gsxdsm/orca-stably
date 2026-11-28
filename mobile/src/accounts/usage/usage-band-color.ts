import {
  clampUsedPercent,
  getDisplayedUsagePercentage,
  type UsagePercentageDisplay
} from '../../../../src/shared/agent-usage/display/usage-percentage-display'
import { getMobilePalette, type MobilePalette } from '../../theme/mobile-theme'

function resolveUsageBandColor(
  usedPercent: number | null,
  unavailable: boolean,
  colors: MobilePalette
): string {
  // Why: round then clamp so bar width, color, and label share one value (desktop parity).
  const used = usedPercent == null ? null : clampUsedPercent(usedPercent)
  // Why: same consumption bands as desktop barColor (green <60, amber <80, red ≥80).
  return unavailable || used == null
    ? colors.textMuted
    : used >= 80
      ? colors.statusRed
      : used >= 60
        ? colors.statusAmber
        : colors.statusGreen
}

/** A meter's fill: the shown percent (used or left) and its consumption colour, shared by every usage meter. */
export function usageBarFill(
  usedPercent: number | null,
  unavailable: boolean,
  display: UsagePercentageDisplay,
  colors: MobilePalette
): { shown: number | null; color: string } {
  // Colour follows consumption either way, so a nearly empty remainder stays red (desktop parity).
  return {
    shown: usedPercent == null ? null : getDisplayedUsagePercentage(usedPercent, display),
    color: resolveUsageBandColor(usedPercent, unavailable, colors)
  }
}

// Fork meters (composer, server resources) color a percent without drawing a bar.
export function usageBandColor(
  usedPercent: number | null,
  colors: MobilePalette = getMobilePalette()
): string {
  if (usedPercent == null || !Number.isFinite(usedPercent)) {
    return colors.textMuted
  }
  return resolveUsageBandColor(usedPercent, false, colors)
}
