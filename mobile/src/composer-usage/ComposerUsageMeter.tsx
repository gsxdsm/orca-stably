import { useContext, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSharedNow } from '../hooks/use-now'
import {
  composerInputStyles,
  MESSAGE_TEXT_INSET
} from '../components/composer-input/composer-input-styles'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useAccountsSnapshot } from './accounts-snapshot-store'
import {
  formatUsageWindowLength,
  pickComposerUsageWindow,
  selectAgentUsage,
  usageProviderForAgent,
  USAGE_PROVIDER_NAMES,
  type AgentUsage
} from './agent-usage-provider'
import {
  ComposerUsageClientContext,
  ComposerUsageTabAgentContext
} from './composer-usage-client-context'
import { useComposerUsageDisplay } from './composer-usage-display-preference'
import {
  composerUsageMeterReadout,
  type ComposerUsageMeterReadout
} from './composer-usage-meter-readout'
import { useComposerUsagePosition } from './composer-usage-position-preference'
import { useComposerUsageWindow } from './composer-usage-window-preference'
import { ComposerUsageSheet } from './ComposerUsageSheet'
import { usagePaceColor } from './usage-pace-color'
import { usageResetLabel } from './usage-reset-label'
import { computeUsagePace } from './usage-window-pace'

type Props = {
  agent: string | null | undefined
  /** The chat composer spans the Duo's status column, so its sheet does too; the terminal's keeps clear of the rail. */
  spanSideStrip?: boolean
}

type Reading = {
  usage: AgentUsage
  readout: ComposerUsageMeterReadout
  /** The bar's fill, by pace like the rail rings and the pop-up. */
  color: string
  length: string
  /** Time left until reset ("3d 2h"), and its largest unit alone ("3d") for a tight row. */
  resetsIn: string
  resetsInCompact: string
  provider: string
  percentLabel: string
  accessibilityLabel: string
}

function useComposerUsageReading(agent: string | null | undefined): Reading | null {
  const t = useMobileTranslation()
  const client = useContext(ComposerUsageClientContext)
  // Before a hook status names the agent, the host's own identification of the tab still does.
  const tabAgent = useContext(ComposerUsageTabAgentContext)
  const usageAgent = agent ?? tabAgent
  // Agentless tabs never open the accounts stream.
  const snapshot = useAccountsSnapshot(usageProviderForAgent(usageAgent) ? client : null)
  const choice = useComposerUsageWindow()
  const display = useComposerUsageDisplay()
  const usage = selectAgentUsage(snapshot, usageAgent)
  // The rail rings read the same clock, so a bar and a ring never disagree by a minute.
  const now = useSharedNow(60_000)
  // A missing chosen window (no 5-hour limit on the plan) falls back to the one the provider reports.
  const entry = usage ? pickComposerUsageWindow(usage.windows, choice) : null
  if (!usage || !entry) {
    return null
  }
  const readout = composerUsageMeterReadout(entry.window.usedPercent, display)
  const length = formatUsageWindowLength(entry.window.windowMinutes)
  const provider = USAGE_PROVIDER_NAMES[usage.provider]
  const vars = { provider, window: length, percent: readout.shown }
  const remaining = display === 'remaining'
  return {
    usage,
    readout,
    color: usagePaceColor(computeUsagePace(entry.window, now), readout.used),
    length,
    resetsIn: usageResetLabel(entry.window, now),
    resetsInCompact: usageResetLabel(entry.window, now, 'compact'),
    provider,
    percentLabel: remaining
      ? t('composerUsage.meter.left', '{{percent}}% left', { percent: readout.shown })
      : `${readout.shown}%`,
    accessibilityLabel: remaining
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
}

/** The composer action row's flexible gap, with the compact usage meter centered in it unless it sits above. */
export function ComposerUsageSlot({ agent, spanSideStrip }: Props): React.JSX.Element {
  const position = useComposerUsagePosition()
  const [room, setRoom] = useState<number | null>(null)
  // The full meter's width, whatever part of it shows, so the row never re-splits as parts drop.
  const [basis, setBasis] = useState<number | null>(null)
  if (position === 'above') {
    return <View style={[composerInputStyles.actionSpacer, styles.emptySlot]} />
  }
  return (
    <View
      style={[
        composerInputStyles.actionSpacer,
        styles.slot,
        basis !== null && { flexBasis: basis }
      ]}
      onLayout={(event) => setRoom(event.nativeEvent.layout.width)}
    >
      <ComposerUsageMeter
        agent={agent}
        spanSideStrip={spanSideStrip}
        room={room}
        onFullWidth={setBasis}
      />
    </View>
  )
}

/** Time-to-reset label and percent over a full-width bar: narrow enough to leave the model pill its name. */
export function ComposerUsageMeter({
  agent,
  spanSideStrip = false,
  room = null,
  onFullWidth
}: Props & {
  /** The slot's width: short of the full meter, the reset label shortens, then it and the meter drop. */
  room?: number | null
  onFullWidth?: (width: number | null) => void
}): React.JSX.Element | null {
  useMobileColorScheme()
  const reading = useComposerUsageReading(agent)
  const [open, setOpen] = useState(false)
  // The labels' own widths, measured off the row, so a dropped label still reports its need.
  const [resetWidth, setResetWidth] = useState<number | null>(null)
  const [compactWidth, setCompactWidth] = useState<number | null>(null)
  const [percentWidth, setPercentWidth] = useState<number | null>(null)
  const fullWidth =
    reading && resetWidth !== null && percentWidth !== null
      ? composerUsageMeterWidth(resetWidth + LABEL_GAP + TRACK_MIN_WIDTH, percentWidth)
      : null
  useEffect(() => onFullWidth?.(fullWidth), [fullWidth, onFullWidth])
  if (!reading) {
    return null
  }
  const fit = composerUsageMeterFit(room, resetWidth, compactWidth, percentWidth)
  return (
    <>
      {fit.meter ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reading.accessibilityLabel}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.meter, pressed && composerInputStyles.pressed]}
          testID="composer-usage-meter"
        >
          <Text style={[styles.text, styles.percent]} numberOfLines={1}>
            {reading.percentLabel}
          </Text>
          <View style={styles.barLine}>
            {fit.label ? (
              <Text style={[styles.text, styles.window]} numberOfLines={1}>
                {fit.label === 'full' ? reading.resetsIn : reading.resetsInCompact}
              </Text>
            ) : null}
            <ComposerUsageTrack readout={reading.readout} color={reading.color} />
          </View>
        </Pressable>
      ) : null}
      <View
        style={styles.measure}
        pointerEvents="none"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          style={styles.text}
          onLayout={(event) => setResetWidth(event.nativeEvent.layout.width)}
        >
          {reading.resetsIn}
        </Text>
        <Text
          style={styles.text}
          onLayout={(event) => setCompactWidth(event.nativeEvent.layout.width)}
        >
          {reading.resetsInCompact}
        </Text>
        <Text
          style={styles.text}
          onLayout={(event) => setPercentWidth(event.nativeEvent.layout.width)}
        >
          {reading.percentLabel}
        </Text>
      </View>
      <ComposerUsageSheet
        visible={open}
        onClose={() => setOpen(false)}
        usage={reading.usage}
        spanSideStrip={spanSideStrip}
      />
    </>
  )
}

/** The meter as one full-width line over the composer text, when the owner moves it out of the controls row. */
export function ComposerUsageStrip({
  agent,
  spanSideStrip = false
}: Props): React.JSX.Element | null {
  useMobileColorScheme()
  const position = useComposerUsagePosition()
  const reading = useComposerUsageReading(agent)
  const [open, setOpen] = useState(false)
  if (position !== 'above' || !reading) {
    return null
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={reading.accessibilityLabel}
        hitSlop={4}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.strip, pressed && composerInputStyles.pressed]}
        testID="composer-usage-strip"
      >
        <Text style={[styles.text, styles.window]} numberOfLines={1}>
          {`${reading.provider} · ${reading.resetsIn}`}
        </Text>
        <ComposerUsageTrack readout={reading.readout} color={reading.color} />
        <Text style={styles.text} numberOfLines={1}>
          {reading.percentLabel}
        </Text>
      </Pressable>
      <ComposerUsageSheet
        visible={open}
        onClose={() => setOpen(false)}
        usage={reading.usage}
        spanSideStrip={spanSideStrip}
      />
    </>
  )
}

function ComposerUsageTrack({
  readout,
  color
}: {
  readout: ComposerUsageMeterReadout
  color: string
}): React.JSX.Element {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${readout.shown}%`, backgroundColor: color }]} />
    </View>
  )
}

const LABEL_GAP = spacing.xs
const TRACK_MIN_WIDTH = 24

function composerUsageMeterWidth(barLineWidth: number, percentWidth: number): number {
  return Math.max(barLineWidth, percentWidth)
}

/** What fits in `room`; everything shows until it is measured. */
function composerUsageMeterFit(
  room: number | null,
  resetWidth: number | null,
  compactWidth: number | null,
  percentWidth: number | null
): { meter: boolean; label: 'full' | 'compact' | null } {
  if (room === null || resetWidth === null || compactWidth === null || percentWidth === null) {
    return { meter: true, label: 'full' }
  }
  const needs = (labelWidth: number): number =>
    composerUsageMeterWidth(labelWidth + LABEL_GAP + TRACK_MIN_WIDTH, percentWidth)
  return {
    meter: room >= composerUsageMeterWidth(TRACK_MIN_WIDTH, percentWidth),
    label: room >= needs(resetWidth) ? 'full' : room >= needs(compactWidth) ? 'compact' : null
  }
}

const styles = themedStyleSheet(() => ({
  // Basis is the meter's width, not 0, so the model pill gives way first and the meter keeps its labels.
  slot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    alignItems: 'center',
    minWidth: 0
  },
  // Cancels one row gap, so an empty spacer squeezed to nothing hands the model pill all its room.
  emptySlot: {
    marginLeft: -spacing.sm
  },
  meter: {
    justifyContent: 'center',
    gap: 2,
    minHeight: 28,
    maxWidth: '100%',
    borderRadius: radii.pill
  },
  percent: {
    textAlign: 'center'
  },
  barLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: LABEL_GAP
  },
  // Inset like the message text below it, so the two share a left edge.
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 20,
    paddingHorizontal: MESSAGE_TEXT_INSET,
    marginBottom: spacing.xs,
    borderRadius: radii.pill
  },
  // Zero-size and clipped: its labels lay out at their own width without showing or taking room.
  measure: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
    flexDirection: 'row'
  },
  text: {
    fontSize: typography.captionSize,
    lineHeight: 13,
    color: colors.textSecondary,
    flexShrink: 0,
    fontVariant: ['tabular-nums']
  },
  window: {
    color: colors.textMuted
  },
  track: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: TRACK_MIN_WIDTH,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.translucentFill,
    overflow: 'hidden'
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill
  }
}))
