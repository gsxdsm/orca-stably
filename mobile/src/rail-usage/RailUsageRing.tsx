import { Pressable, Text, View } from 'react-native'
import Svg, { Line, Path } from 'react-native-svg'
import { usageBandColor } from '../accounts/usage/UsageBar'
import {
  formatUsageWindowLength,
  USAGE_PROVIDER_NAMES,
  type AgentUsage,
  type UsageProviderKey
} from '../composer-usage/agent-usage-provider'
import { composerUsageMeterReadout } from '../composer-usage/composer-usage-meter-readout'
import { useComposerUsageDisplay } from '../composer-usage/composer-usage-display-preference'
import { computeUsagePace, usagePaceMarkerPercent } from '../composer-usage/usage-window-pace'
import { MiniMaxIcon, OpenCodeGoIcon } from '../components/icons/AgentIcons'
import { MobileAgentIcon } from '../components/icons/MobileAgentIcon'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { DUO_STATUS_GLYPH_SIZE } from '../layout/duo-status-row'
import { colors, feedback } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import {
  pickRailUsageWindow,
  RAIL_USAGE_PROVIDER_AGENT,
  railRingArc,
  railRingPoint,
  railUsageTone,
  inRailRingLabelHole,
  type RailUsageTone
} from './rail-usage-model'

// The iOS status glyph above draws a 37 pt ring; these match it.
const SIZE = DUO_STATUS_GLYPH_SIZE
const STROKE = 3.5
const CENTER = SIZE / 2
const RADIUS = (SIZE - STROKE) / 2
const GLYPH_SIZE = 15

function toneColor(tone: RailUsageTone, used: number): string {
  switch (tone) {
    case 'under':
      return colors.statusGreen
    case 'on-pace':
      return colors.textPrimary
    case 'ahead':
      return colors.statusAmber
    case 'over':
      return colors.statusRed
    case 'unpaced':
      return usageBandColor(used)
  }
}

export function RailUsageProviderGlyph({
  provider,
  size
}: {
  provider: UsageProviderKey
  size: number
}): React.JSX.Element {
  if (provider === 'opencodeGo') {
    return <OpenCodeGoIcon size={size} />
  }
  if (provider === 'minimax') {
    return <MiniMaxIcon size={size} />
  }
  return <MobileAgentIcon agentId={RAIL_USAGE_PROVIDER_AGENT[provider]} size={size} />
}

/** One provider's most relevant window as an arc gauge, drawn like the Duo's Wi-Fi and battery ring. */
export function RailUsageRing({
  usage,
  now,
  onPress
}: {
  usage: AgentUsage
  now: number
  onPress: () => void
}): React.JSX.Element | null {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const display = useComposerUsageDisplay()
  const entry = pickRailUsageWindow(usage.windows)
  if (!entry) {
    return null
  }
  const readout = composerUsageMeterReadout(entry.window.usedPercent, display)
  const fill = toneColor(railUsageTone(computeUsagePace(entry.window, now)), readout.used)
  const marker = usagePaceMarkerPercent(entry.window, now, display)
  const provider = USAGE_PROVIDER_NAMES[usage.provider]
  const vars = {
    provider,
    window: formatUsageWindowLength(entry.window.windowMinutes),
    percent: readout.shown
  }
  const tick = marker === null || inRailRingLabelHole(marker / 100) ? null : marker / 100
  const tickInner = tick === null ? null : railRingPoint(CENTER, RADIUS - STROKE, tick)
  const tickOuter = tick === null ? null : railRingPoint(CENTER, RADIUS + STROKE, tick)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        display === 'remaining'
          ? t(
              'composerUsage.meter.labelRemaining',
              '{{provider}} {{window}} usage: {{percent}}% left. Show details',
              vars
            )
          : t(
              'composerUsage.meter.label',
              '{{provider}} {{window}} usage: {{percent}}% used. Show details',
              vars
            )
      }
      hitSlop={{ left: 12, right: 12, top: 4, bottom: 4 }}
      onPress={onPress}
      style={({ pressed }) => [styles.ring, pressed && styles.pressed]}
      testID={`rail-usage-ring-${usage.provider}`}
    >
      <Svg width={SIZE} height={SIZE} style={styles.arc}>
        <Path
          d={railRingArc(CENTER, RADIUS, 0, 1)}
          stroke={colors.translucentFill}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
        />
        {readout.shown > 0 ? (
          <Path
            d={railRingArc(CENTER, RADIUS, 0, readout.shown / 100)}
            stroke={fill}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
        {tickInner && tickOuter ? (
          <Line
            x1={tickInner.x}
            y1={tickInner.y}
            x2={tickOuter.x}
            y2={tickOuter.y}
            stroke={colors.textSecondary}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ) : null}
      </Svg>
      <View style={[styles.labelRow, styles.percentRow]} pointerEvents="none">
        <Text style={styles.percent} numberOfLines={1} allowFontScaling={false}>
          {readout.shown}
        </Text>
      </View>
      <RailUsageProviderGlyph provider={usage.provider} size={GLYPH_SIZE} />
      <View style={[styles.labelRow, styles.windowRow]} pointerEvents="none">
        <Text style={styles.window} numberOfLines={1} allowFontScaling={false}>
          {vars.window}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = themedStyleSheet(() => ({
  ring: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pressed: {
    opacity: feedback.pressedOpacity
  },
  arc: {
    position: 'absolute',
    top: 0,
    left: 0
  },
  labelRow: {
    position: 'absolute',
    left: -8,
    right: -8,
    alignItems: 'center'
  },
  // Centered on the ring's top, in the break the arc leaves for it.
  percentRow: {
    top: -5
  },
  // In the ring's bottom opening.
  windowRow: {
    bottom: -4
  },
  percent: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums']
  },
  window: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums']
  }
}))
