import { useContext, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { usageBandColor } from '../accounts/usage/UsageBar'
import { composerInputStyles } from '../components/composer-input/composer-input-styles'
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
  USAGE_PROVIDER_NAMES
} from './agent-usage-provider'
import {
  ComposerUsageClientContext,
  ComposerUsageTabAgentContext
} from './composer-usage-client-context'
import { useComposerUsageDisplay } from './composer-usage-display-preference'
import { composerUsageMeterReadout } from './composer-usage-meter-readout'
import { useComposerUsageWindow } from './composer-usage-window-preference'
import { ComposerUsageSheet } from './ComposerUsageSheet'

type Props = {
  agent: string | null | undefined
  /** The chat composer spans the Duo's status column, so its sheet does too; the terminal's keeps clear of the rail. */
  spanSideStrip?: boolean
}

/** The composer action row's flexible gap, with the agent's usage meter centered in it. */
export function ComposerUsageSlot({ agent, spanSideStrip }: Props): React.JSX.Element {
  const [room, setRoom] = useState<number | null>(null)
  // The full meter's width, whatever part of it shows, so the row never re-splits as parts drop.
  const [basis, setBasis] = useState<number | null>(null)
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

export function ComposerUsageMeter({
  agent,
  spanSideStrip = false,
  room = null,
  onFullWidth
}: Props & {
  /** The slot's width: short of the full meter, the bar shrinks, then the window label, the bar and the meter drop. */
  room?: number | null
  onFullWidth?: (width: number | null) => void
}): React.JSX.Element | null {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const client = useContext(ComposerUsageClientContext)
  // Before a hook status names the agent, the host's own identification of the tab still does.
  const tabAgent = useContext(ComposerUsageTabAgentContext)
  const usageAgent = agent ?? tabAgent
  // Agentless tabs never open the accounts stream.
  const snapshot = useAccountsSnapshot(usageProviderForAgent(usageAgent) ? client : null)
  const choice = useComposerUsageWindow()
  const display = useComposerUsageDisplay()
  const [open, setOpen] = useState(false)
  // The labels' own widths, measured off the row, so a squeezed or dropped label still reports its need.
  const [lengthWidth, setLengthWidth] = useState<number | null>(null)
  const [percentWidth, setPercentWidth] = useState<number | null>(null)
  const usage = selectAgentUsage(snapshot, usageAgent)
  // A missing chosen window (no 5-hour limit on the plan) falls back to the one the provider reports.
  const entry = usage ? pickComposerUsageWindow(usage.windows, choice) : null
  const fullWidth =
    entry && lengthWidth !== null && percentWidth !== null
      ? 2 * spacing.sm + lengthWidth + TRACK_WIDTH + percentWidth + 2 * METER_GAP
      : null
  useEffect(() => onFullWidth?.(fullWidth), [fullWidth, onFullWidth])
  if (!usage || !entry) {
    return null
  }
  const readout = composerUsageMeterReadout(entry.window.usedPercent, display)
  const length = formatUsageWindowLength(entry.window.windowMinutes)
  const provider = USAGE_PROVIDER_NAMES[usage.provider]
  const showingRemaining = display === 'remaining'
  const percentLabel = showingRemaining
    ? t('composerUsage.meter.left', '{{percent}}% left', { percent: readout.shown })
    : `${readout.shown}%`
  const fit = composerUsageMeterFit(room, lengthWidth, percentWidth)
  return (
    <>
      {fit.meter ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            showingRemaining
              ? t(
                  'composerUsage.meter.labelRemaining',
                  '{{provider}} {{window}} usage: {{percent}}% left. Show details',
                  { provider, window: length, percent: readout.shown }
                )
              : t(
                  'composerUsage.meter.label',
                  '{{provider}} {{window}} usage: {{percent}}% used. Show details',
                  { provider, window: length, percent: readout.shown }
                )
          }
          hitSlop={6}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.meter, pressed && composerInputStyles.pressed]}
          testID="composer-usage-meter"
        >
          {fit.length ? (
            <Text style={styles.text} numberOfLines={1}>
              {length}
            </Text>
          ) : null}
          {fit.track ? (
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${readout.shown}%`,
                    backgroundColor: usageBandColor(readout.used)
                  }
                ]}
              />
            </View>
          ) : null}
          <Text style={styles.text} numberOfLines={1}>
            {percentLabel}
          </Text>
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
          {length}
        </Text>
        <Text
          style={styles.text}
          onLayout={(event) => setPercentWidth(event.nativeEvent.layout.width)}
        >
          {percentLabel}
        </Text>
      </View>
      <ComposerUsageSheet
        visible={open}
        onClose={() => setOpen(false)}
        usage={usage}
        spanSideStrip={spanSideStrip}
      />
    </>
  )
}

const METER_GAP = 6
const TRACK_WIDTH = 36
const TRACK_MIN_WIDTH = 12

/** What fits in `room`; everything shows until it is measured. */
function composerUsageMeterFit(
  room: number | null,
  lengthWidth: number | null,
  percentWidth: number | null
): { meter: boolean; track: boolean; length: boolean } {
  if (room === null || lengthWidth === null || percentWidth === null) {
    return { meter: true, track: true, length: true }
  }
  const bare = 2 * spacing.sm + percentWidth
  const withTrack = bare + METER_GAP + TRACK_MIN_WIDTH
  const track = room >= withTrack
  return {
    meter: room >= bare,
    track,
    length: track && room >= withTrack + METER_GAP + lengthWidth
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
  meter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: METER_GAP,
    minHeight: 28,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
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
    fontSize: typography.metaSize,
    color: colors.textSecondary,
    flexShrink: 0,
    fontVariant: ['tabular-nums']
  },
  track: {
    flexShrink: 1,
    width: TRACK_WIDTH,
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
