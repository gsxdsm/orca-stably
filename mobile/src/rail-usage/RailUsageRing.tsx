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
  type RailUsageTone
} from './rail-usage-model'

// The iOS status glyph draws a 37pt ring with a 3.5pt stroke; larger rings keep its proportions, capped so the arc stays light.
const GLYPH_RING_STROKE = 3.5
const MAX_STROKE = 5

function ringGeometry(diameter: number) {
  const stroke = Math.min(MAX_STROKE, (GLYPH_RING_STROKE * diameter) / DUO_STATUS_GLYPH_SIZE)
  const center = diameter / 2
  // Room inside the box for the pace tick, which crosses the arc.
  const radius = center - stroke
  return { stroke, center, radius, glyph: Math.round(diameter * 0.36) }
}

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
  diameter,
  onPress
}: {
  usage: AgentUsage
  now: number
  diameter: number
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
  const { stroke, center, radius, glyph } = ringGeometry(diameter)
  const tick = marker === null ? null : marker / 100
  const tickInner = tick === null ? null : railRingPoint(center, radius - stroke, tick)
  const tickOuter = tick === null ? null : railRingPoint(center, radius + stroke, tick)
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
      hitSlop={{ left: 4, right: 4, top: 4, bottom: 4 }}
      onPress={onPress}
      style={({ pressed }) => [styles.item, { width: diameter }, pressed && styles.pressed]}
      testID={`rail-usage-ring-${usage.provider}`}
    >
      <Text style={styles.percent} numberOfLines={1} allowFontScaling={false}>
        {readout.shown}
      </Text>
      <View style={[styles.ring, { width: diameter, height: diameter }]}>
        <Svg width={diameter} height={diameter} style={styles.arc}>
          <Path
            d={railRingArc(center, radius, 0, 1)}
            stroke={colors.translucentFill}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
          />
          {readout.shown > 0 ? (
            <Path
              d={railRingArc(center, radius, 0, readout.shown / 100)}
              stroke={fill}
              strokeWidth={stroke}
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
        <RailUsageProviderGlyph provider={usage.provider} size={glyph} />
        <Text style={styles.window} numberOfLines={1} allowFontScaling={false}>
          {vars.window}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = themedStyleSheet(() => ({
  // Number above the ring, glyph and window inside it, as the status glyph shows its battery.
  item: {
    alignItems: 'center',
    gap: 2
  },
  pressed: {
    opacity: feedback.pressedOpacity
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  arc: {
    position: 'absolute',
    top: 0,
    left: 0
  },
  percent: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums']
  },
  window: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums']
  }
}))
