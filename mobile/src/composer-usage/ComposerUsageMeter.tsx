import { useContext, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useNow } from '../hooks/use-now'
import {
  composerInputStyles,
  MESSAGE_TEXT_INSET
} from '../components/composer-input/composer-input-styles'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import type { AccountsSnapshot } from '../accounts/accounts-snapshot'
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
import { composerUsageWideMeterWidth } from './composer-usage-wide-meter'
import { usagePaceColor } from './usage-pace-color'
import { computeUsagePace } from './usage-window-pace'

type Props = {
  agent: string | null | undefined
  /** The chat composer spans the Duo's status column, so its sheet does too; the terminal's keeps clear of the rail. */
  spanSideStrip?: boolean
}

type Reading = {
  usage: AgentUsage
  snapshot: AccountsSnapshot
  readout: ComposerUsageMeterReadout
  /** The bar's fill, by pace like the rail rings and the pop-up. */
  color: string
  length: string
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
  const now = useNow(60_000)
  // A missing chosen window (no 5-hour limit on the plan) falls back to the one the provider reports.
  const entry = usage ? pickComposerUsageWindow(usage.windows, choice) : null
  if (!snapshot || !usage || !entry) {
    return null
  }
  const readout = composerUsageMeterReadout(entry.window.usedPercent, display)
  const length = formatUsageWindowLength(entry.window.windowMinutes)
  const provider = USAGE_PROVIDER_NAMES[usage.provider]
  const vars = { provider, window: length, percent: readout.shown }
  const remaining = display === 'remaining'
  return {
    usage,
    snapshot,
    readout,
    color: usagePaceColor(computeUsagePace(entry.window, now), readout.used),
    length,
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

/** Window label and percent over a full-width bar: narrow enough to leave the model pill its name. */
export function ComposerUsageMeter({
  agent,
  spanSideStrip = false,
  room = null,
  onFullWidth
}: Props & {
  /** The slot's width: short of the full meter, the window label and then the meter drop. */
  room?: number | null
  onFullWidth?: (width: number | null) => void
}): React.JSX.Element | null {
  useMobileColorScheme()
  const reading = useComposerUsageReading(agent)
  const [open, setOpen] = useState(false)
  // The labels' own widths, measured off the row, so a dropped label still reports its need.
  const [lengthWidth, setLengthWidth] = useState<number | null>(null)
  const [percentWidth, setPercentWidth] = useState<number | null>(null)
  const fullWidth =
    reading && lengthWidth !== null && percentWidth !== null
      ? composerUsageMeterWidth(lengthWidth + LABEL_GAP + TRACK_MIN_WIDTH, percentWidth)
      : null
  useEffect(() => onFullWidth?.(fullWidth), [fullWidth, onFullWidth])
  const wideWidth = composerUsageWideMeterWidth(room)
  if (!reading) {
    return null
  }
  const fit = composerUsageMeterFit(room, lengthWidth, percentWidth)
  return (
    <>
      {wideWidth !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reading.accessibilityLabel}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.wideMeter,
            { width: wideWidth },
            pressed && composerInputStyles.pressed
          ]}
          testID="composer-usage-meter"
        >
          <Text style={[styles.wideText, styles.window]} numberOfLines={1}>
            {reading.length}
          </Text>
          <ComposerUsageTrack readout={reading.readout} color={reading.color} wide />
          <Text style={[styles.wideText, styles.widePercent]} numberOfLines={1}>
            {reading.percentLabel}
          </Text>
        </Pressable>
      ) : fit.meter ? (
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
            {fit.length ? (
              <Text style={[styles.text, styles.window]} numberOfLines={1}>
                {reading.length}
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
          onLayout={(event) => setLengthWidth(event.nativeEvent.layout.width)}
        >
          {reading.length}
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
        snapshot={reading.snapshot}
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
          {`${reading.provider} · ${reading.length}`}
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
        snapshot={reading.snapshot}
        spanSideStrip={spanSideStrip}
      />
    </>
  )
}

function ComposerUsageTrack({
  readout,
  color,
  wide = false
}: {
  readout: ComposerUsageMeterReadout
  color: string
  wide?: boolean
}): React.JSX.Element {
  return (
    <View style={[styles.track, wide && styles.wideTrack]}>
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
  lengthWidth: number | null,
  percentWidth: number | null
): { meter: boolean; length: boolean } {
  if (room === null || lengthWidth === null || percentWidth === null) {
    return { meter: true, length: true }
  }
  const bare = composerUsageMeterWidth(TRACK_MIN_WIDTH, percentWidth)
  return {
    meter: room >= bare,
    length: room >= composerUsageMeterWidth(lengthWidth + LABEL_GAP + TRACK_MIN_WIDTH, percentWidth)
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
  // One line, label · bar · percent, sized from the composer's free room on a tablet.
  wideMeter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 32,
    borderRadius: radii.pill
  },
  wideText: {
    fontSize: typography.bodySize,
    lineHeight: 18,
    color: colors.textSecondary,
    flexShrink: 0,
    fontVariant: ['tabular-nums']
  },
  widePercent: {
    fontWeight: '600',
    color: colors.textPrimary
  },
  wideTrack: {
    height: 6
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
