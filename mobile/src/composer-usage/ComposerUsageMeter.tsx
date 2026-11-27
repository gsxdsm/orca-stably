import { useContext, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  composerInputStylesSheet,
  MESSAGE_TEXT_INSET
} from '../components/composer-input/composer-input-styles'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useKeyboardPersistingTaps } from '../platform/keyboard/keyboard-persisting-taps'
import { radii, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet, useThemedStyles } from '../theme/themed-styles'
import { useMobileColors } from '../theme/use-mobile-color-scheme'
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
  ComposerUsagePaneWidthContext,
  ComposerUsageTabAgentContext
} from './composer-usage-client-context'
import { useComposerUsageDisplay } from './composer-usage-display-preference'
import {
  composerUsageMeterReadout,
  type ComposerUsageMeterReadout
} from './composer-usage-meter-readout'
import { useComposerUsagePosition } from './composer-usage-position-preference'
import { useComposerUsageWindow } from './composer-usage-window-preference'
import { useComposerUsageSheetOpener } from './ComposerUsageSheetHost'
import {
  composerUsagePaneAllowsWideMeter,
  composerUsageWideMeterLayout
} from './composer-usage-wide-meter'
import { ComposerUsageTrack, TRACK_MIN_WIDTH } from './ComposerUsageTrack'
import {
  COMPOSER_USAGE_WIDE_GAP,
  ComposerUsageWideMeasure,
  ComposerUsageWideMeter
} from './ComposerUsageWideMeter'
import { usageWindowPaceColor } from './usage-pace-color'
import { useUsagePaceColorThresholds } from './usage-pace-color-preference'
import { usageResetLabel } from './usage-reset-label'
import { useResetCountdownNow } from './use-reset-countdown-now'
import { usagePaceMarkerPercent } from './usage-window-pace'

type Props = {
  agent: string | null | undefined
}

type Reading = {
  usage: AgentUsage
  snapshot: AccountsSnapshot
  readout: ComposerUsageMeterReadout
  /** The bar's fill, by pace like the rail rings and the pop-up. */
  color: string
  /** Where an even burn would put the fill; null when the reset time is unknown. */
  paceMarkerPercent: number | null
  length: string
  /** Time left until reset ("3d 2h"), and its largest unit alone ("3d") for a tight row. */
  resetsIn: string
  resetsInCompact: string
  provider: string
  percentLabel: string
  accessibilityLabel: string
}

function useComposerUsageReading(agent: string | null | undefined): Reading | null {
  const colors = useMobileColors()
  const t = useMobileTranslation()
  const client = useContext(ComposerUsageClientContext)
  // Before a hook status names the agent, the host's own identification of the tab still does.
  const tabAgent = useContext(ComposerUsageTabAgentContext)
  const usageAgent = agent ?? tabAgent
  // Agentless tabs never open the accounts stream.
  const snapshot = useAccountsSnapshot(usageProviderForAgent(usageAgent) ? client : null)
  const choice = useComposerUsageWindow()
  const display = useComposerUsageDisplay()
  const thresholds = useUsagePaceColorThresholds()
  const usage = selectAgentUsage(snapshot, usageAgent)
  const now = useResetCountdownNow(usage?.windows.flatMap((e) => e.window.resetsAt ?? []) ?? [])
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
    color: usageWindowPaceColor(entry.window, now, thresholds, colors),
    paceMarkerPercent: usagePaceMarkerPercent(entry.window, now, display),
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

/** The composer action row's usage meter: hugs its compact width on narrow panes and centers wide bars on full-width panes. */
export function ComposerUsageSlot({ agent }: Props): React.JSX.Element | null {
  const styles = useThemedStyles(stylesSheet)
  const composerInputStyles = useThemedStyles(composerInputStylesSheet)
  const position = useComposerUsagePosition()
  const paneWidth = useContext(ComposerUsagePaneWidthContext)
  const reading = useComposerUsageReading(agent)
  const [room, setRoom] = useState<number | null>(null)
  if (position === 'above' || !reading) {
    return null
  }
  const canUseWide = composerUsagePaneAllowsWideMeter(paneWidth)
  return (
    <View
      style={canUseWide ? [composerInputStyles.actionSpacer, styles.wideSlot] : styles.compactSlot}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width
        setRoom((current) => (current === width ? current : width))
      }}
    >
      <ComposerUsageMeterBody
        reading={reading}
        room={canUseWide ? room : null}
        paneWidth={paneWidth}
        compactOnly={!canUseWide}
      />
    </View>
  )
}

/** Time-to-reset label and percent over a full-width bar: narrow enough to leave the model pill its name. */
export function ComposerUsageMeter({
  agent,
  room = null,
  paneWidth,
  onFullWidth
}: Props & {
  /** The slot's width: short of the full meter, the reset label shortens, then it and the meter drop. */
  room?: number | null
  paneWidth?: number | null
  onFullWidth?: (width: number | null) => void
}): React.JSX.Element | null {
  const contextPaneWidth = useContext(ComposerUsagePaneWidthContext)
  const reading = useComposerUsageReading(agent)
  const resolvedPaneWidth = paneWidth === undefined ? contextPaneWidth : paneWidth
  if (!reading) {
    return null
  }
  return (
    <ComposerUsageMeterBody
      reading={reading}
      room={room}
      paneWidth={resolvedPaneWidth}
      compactOnly={false}
      onFullWidth={onFullWidth}
    />
  )
}

function ComposerUsageMeterBody({
  reading,
  room,
  paneWidth,
  compactOnly,
  onFullWidth
}: {
  reading: Reading
  room: number | null
  paneWidth: number | null
  compactOnly: boolean
  onFullWidth?: (width: number | null) => void
}): React.JSX.Element {
  const styles = useThemedStyles(stylesSheet)
  const composerInputStyles = useThemedStyles(composerInputStylesSheet)
  // Keep focus in the composer field so the idle-collapsible pill does not unmount the bar mid-tap.
  const keepsFocus = useKeyboardPersistingTaps('always')
  const sheet = useComposerUsageSheetOpener(reading.usage, reading.snapshot)
  // The labels' own widths, measured off the row, so a dropped label still reports its need.
  const [resetWidth, setResetWidth] = useState<number | null>(null)
  const [compactWidth, setCompactWidth] = useState<number | null>(null)
  const [percentWidth, setPercentWidth] = useState<number | null>(null)
  // The same two at the wide meter's size, so it keeps the full reset label and shortens the bar.
  const [wideResetWidth, setWideResetWidth] = useState<number | null>(null)
  const [widePercentWidth, setWidePercentWidth] = useState<number | null>(null)
  const fullWidth =
    resetWidth !== null && percentWidth !== null
      ? composerUsageMeterWidth(resetWidth + LABEL_GAP + TRACK_MIN_WIDTH, percentWidth)
      : null
  useEffect(() => onFullWidth?.(fullWidth), [fullWidth, onFullWidth])
  const wide = compactOnly
    ? null
    : composerUsageWideMeterLayout({
        room,
        paneWidth,
        fullLabelWidth: wideResetWidth,
        percentWidth: widePercentWidth,
        gap: COMPOSER_USAGE_WIDE_GAP
      })
  const fit = compactOnly
    ? ({ meter: true, label: 'compact' } as const)
    : composerUsageMeterFit(room, resetWidth, compactWidth, percentWidth)
  return (
    <>
      {wide !== null ? (
        <ComposerUsageWideMeter
          layout={wide}
          accessibilityLabel={reading.accessibilityLabel}
          resetsIn={reading.resetsIn}
          resetsInCompact={reading.resetsInCompact}
          percentLabel={reading.percentLabel}
          readout={reading.readout}
          color={reading.color}
          paceMarkerPercent={reading.paceMarkerPercent}
          onPress={sheet.open}
        />
      ) : fit.meter ? (
        <Pressable
          ref={keepsFocus}
          accessibilityRole="button"
          accessibilityLabel={reading.accessibilityLabel}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          onPress={sheet.open}
          style={({ pressed }) => [styles.meter, pressed && composerInputStyles.pressed]}
          testID="composer-usage-meter"
        >
          <Text style={[styles.text, styles.percent]} numberOfLines={1}>
            {reading.percentLabel}
          </Text>
          <View style={[styles.barLine, compactOnly && styles.compactBarLine]}>
            {fit.label ? (
              <Text style={[styles.text, styles.window]} numberOfLines={1}>
                {fit.label === 'full' ? reading.resetsIn : reading.resetsInCompact}
              </Text>
            ) : null}
            <ComposerUsageTrack readout={reading.readout} color={reading.color} />
          </View>
        </Pressable>
      ) : null}
      {compactOnly ? null : (
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
          <ComposerUsageWideMeasure
            resetsIn={reading.resetsIn}
            percentLabel={reading.percentLabel}
            onResetWidth={setWideResetWidth}
            onPercentWidth={setWidePercentWidth}
          />
        </View>
      )}
      {sheet.inlineSheet}
    </>
  )
}

/** The meter as one full-width line over the composer text, when the owner moves it out of the controls row. */
export function ComposerUsageStrip({ agent }: Props): React.JSX.Element | null {
  const styles = useThemedStyles(stylesSheet)
  const composerInputStyles = useThemedStyles(composerInputStylesSheet)
  const keepsFocus = useKeyboardPersistingTaps('always')
  const position = useComposerUsagePosition()
  const reading = useComposerUsageReading(agent)
  const sheet = useComposerUsageSheetOpener(reading?.usage ?? null, reading?.snapshot ?? null)
  if (position !== 'above' || !reading) {
    return null
  }
  return (
    <>
      <Pressable
        ref={keepsFocus}
        accessibilityRole="button"
        accessibilityLabel={reading.accessibilityLabel}
        hitSlop={4}
        onPress={sheet.open}
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
      {sheet.inlineSheet}
    </>
  )
}

const LABEL_GAP = spacing.xs
const COMPACT_LABEL_GAP = 3

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

const stylesSheet = themedStyleSheet((colors) => ({
  // Hugs the compact meter on narrow panes so the leading model pill keeps all leftover width.
  compactSlot: {
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  // Centers the wide meter in the generous middle gap on full-screen Duo and iPad panes.
  wideSlot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    alignItems: 'center',
    minWidth: 0
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
  compactBarLine: {
    gap: COMPACT_LABEL_GAP
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
  // Zero-height and clipped, but wide, so a two-word label measures on one line without showing.
  measure: {
    position: 'absolute',
    width: 1000,
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
  }
}))
