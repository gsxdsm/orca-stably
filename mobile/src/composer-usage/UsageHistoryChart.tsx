import { useState } from 'react'
import { Platform, Text, View } from 'react-native'
import Svg, { Circle, Defs, Line, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg'
import { formatResetDuration } from '../../../src/shared/agent-usage/rate-limits/rate-limit-reset-format'
import { getUiIntlLocale } from '../i18n/ui-intl-locale'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import type { UsageChartModel } from './usage-window-stats'

const PLOT_HEIGHT = 112
const TOP = 16
const AXIS_GUTTER = 34
const RIGHT = 4
const X_LABELS = 16
const HEIGHT = TOP + PLOT_HEIGHT + X_LABELS
const LABEL_SIZE = typography.captionSize
// A middle time label only once three dates fit side by side.
const MID_LABEL_MIN_WIDTH = 380
const DAY_MS = 24 * 60 * 60_000
// SVG text on the web page otherwise falls back to the browser's serif font.
const LABEL_FONT =
  Platform.OS === 'web' ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : undefined

function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/** Times on one day read as clock times; a window past midnight names the day, a long one the date. */
function axisTimeFormat(startsAt: number, endsAt: number): (at: number) => string {
  const locale = getUiIntlLocale()
  const options: Intl.DateTimeFormatOptions = sameDay(startsAt, endsAt - 1)
    ? { hour: 'numeric', minute: '2-digit' }
    : endsAt - startsAt <= 2 * DAY_MS
      ? { weekday: 'short', hour: 'numeric', minute: '2-digit' }
      : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
  const format = new Intl.DateTimeFormat(locale, options)
  return (at) => format.format(new Date(at))
}

/** Used (or left) percent across the whole window, from its last reset to its next. Before the first
 *  reading and wherever the desktop was not reading usage the plot is hatched as no data, so an
 *  empty stretch never reads as zero; the even-burn line is dashed and now is a labelled tick. */
export function UsageHistoryChart({
  model,
  color,
  seriesLabel,
  accessibilityLabel
}: {
  model: UsageChartModel
  color: string
  seriesLabel: string
  accessibilityLabel: string
}): React.JSX.Element {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const [width, setWidth] = useState(0)
  const span = model.endsAt - model.startsAt
  const plotWidth = Math.max(0, width - AXIS_GUTTER - RIGHT)
  const x = (at: number): number => AXIS_GUTTER + ((at - model.startsAt) / span) * plotWidth
  const y = (value: number): number => TOP + (1 - value / 100) * PLOT_HEIGHT
  const formatTime = axisTimeFormat(model.startsAt, model.endsAt)
  const last = model.runs.at(-1)?.at(-1)
  const noData: { from: number; to: number }[] = [{ from: model.startsAt, to: model.firstAt }]
  model.runs.forEach((run, index) => {
    const next = model.runs[index + 1]?.[0]
    const end = run.at(-1)
    if (next && end) {
      noData.push({ from: end.at, to: next.at })
    }
  })
  const leading = noData[0]
  const leadingWide = leading ? x(leading.to) - x(leading.from) >= 64 : false
  const nowX = x(model.now)
  const nowAnchor =
    nowX - AXIS_GUTTER < 24 ? 'start' : x(model.endsAt) - nowX < 24 ? 'end' : 'middle'
  const historyMs = (last?.at ?? model.firstAt) - model.firstAt
  const caption = t('composerUsage.chart.historySince', 'History since {{when}} · {{duration}}', {
    when: new Date(model.firstAt).toLocaleString(getUiIntlLocale(), {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit'
    }),
    duration:
      historyMs < 60_000
        ? t('composerUsage.chart.oneReading', 'one reading')
        : formatResetDuration(historyMs)
  })
  return (
    <View style={styles.wrap}>
      <Text style={styles.caption} testID="composer-usage-chart-history">
        {caption}
      </Text>
      <View
        style={{ height: HEIGHT }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        testID="composer-usage-chart"
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <Pattern id="usage-no-data" patternUnits="userSpaceOnUse" width={6} height={6}>
                <Path
                  d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2"
                  stroke={colors.textMuted}
                  strokeOpacity={0.35}
                  strokeWidth={1}
                />
              </Pattern>
            </Defs>
            {noData.map((range) =>
              x(range.to) - x(range.from) >= 1 ? (
                <Rect
                  key={`gap-${range.from}`}
                  x={x(range.from)}
                  y={y(100)}
                  width={x(range.to) - x(range.from)}
                  height={PLOT_HEIGHT}
                  fill="url(#usage-no-data)"
                />
              ) : null
            )}
            {leading && leadingWide ? (
              <SvgText
                x={(x(leading.from) + x(leading.to)) / 2}
                y={y(50) + LABEL_SIZE / 3}
                fontSize={LABEL_SIZE}
                fontFamily={LABEL_FONT}
                fill={colors.textSecondary}
                textAnchor="middle"
              >
                {t('composerUsage.chart.noData', 'No data')}
              </SvgText>
            ) : null}
            {[0, 50, 100].map((value) => (
              <Line
                key={`grid-${value}`}
                x1={AXIS_GUTTER}
                x2={width - RIGHT}
                y1={y(value)}
                y2={y(value)}
                stroke={colors.textMuted}
                strokeOpacity={value === 0 ? 0.5 : 0.25}
                strokeWidth={1}
                strokeDasharray={value === 50 ? '2 3' : undefined}
              />
            ))}
            {[0, 50, 100].map((value) => (
              <SvgText
                key={`grid-label-${value}`}
                x={AXIS_GUTTER - 6}
                y={y(value) + LABEL_SIZE / 3}
                fontSize={LABEL_SIZE}
                fontFamily={LABEL_FONT}
                fill={colors.textMuted}
                textAnchor="end"
              >
                {`${value}%`}
              </SvgText>
            ))}
            {model.pace ? (
              <Line
                x1={x(model.startsAt)}
                y1={y(model.pace.from)}
                x2={x(model.endsAt)}
                y2={y(model.pace.to)}
                stroke={colors.textSecondary}
                strokeOpacity={0.7}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ) : null}
            {model.runs.map((run) => {
              const start = run[0]
              const end = run.at(-1)
              if (!start || !end || run.length < 2) {
                return null
              }
              const line = run
                .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at)},${y(p.value)}`)
                .join(' ')
              return (
                <Path
                  key={`area-${start.at}`}
                  d={`${line} L${x(end.at)},${y(0)} L${x(start.at)},${y(0)} Z`}
                  fill={color}
                  fillOpacity={0.14}
                />
              )
            })}
            {model.runs.map((run) => {
              const start = run[0]
              if (!start || run.length < 2) {
                return null
              }
              return (
                <Path
                  key={`line-${start.at}`}
                  d={run.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at)},${y(p.value)}`).join(' ')}
                  stroke={color}
                  strokeWidth={2}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )
            })}
            <Line
              x1={nowX}
              x2={nowX}
              y1={TOP - 2}
              y2={y(0)}
              stroke={colors.textSecondary}
              strokeWidth={1}
            />
            <SvgText
              x={nowX}
              y={TOP - 5}
              fontSize={LABEL_SIZE}
              fontFamily={LABEL_FONT}
              fontWeight="600"
              fill={colors.textSecondary}
              textAnchor={nowAnchor}
            >
              {t('composerUsage.chart.now', 'Now')}
            </SvgText>
            {model.runs.flatMap((run) => {
              const start = run[0]
              const end = run.at(-1)
              const ends = start && end && end !== start ? [start, end] : start ? [start] : []
              return ends.map((point) => (
                <Circle
                  key={`dot-${point.at}`}
                  cx={x(point.at)}
                  cy={y(point.value)}
                  r={point.at === model.firstAt ? 4 : 3}
                  fill={color}
                  stroke={colors.sheetSurface}
                  strokeWidth={1.5}
                />
              ))
            })}
            <SvgText
              x={x(model.startsAt)}
              y={HEIGHT - 3}
              fontSize={LABEL_SIZE}
              fontFamily={LABEL_FONT}
              fill={colors.textMuted}
              textAnchor="start"
            >
              {formatTime(model.startsAt)}
            </SvgText>
            {plotWidth >= MID_LABEL_MIN_WIDTH ? (
              <SvgText
                x={x(model.startsAt + span / 2)}
                y={HEIGHT - 3}
                fontSize={LABEL_SIZE}
                fontFamily={LABEL_FONT}
                fill={colors.textMuted}
                textAnchor="middle"
              >
                {formatTime(model.startsAt + span / 2)}
              </SvgText>
            ) : null}
            <SvgText
              x={x(model.endsAt)}
              y={HEIGHT - 3}
              fontSize={LABEL_SIZE}
              fontFamily={LABEL_FONT}
              fill={colors.textMuted}
              textAnchor="end"
            >
              {formatTime(model.endsAt)}
            </SvgText>
          </Svg>
        ) : null}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatchLine, { backgroundColor: color }]} />
          <Text style={styles.legendText}>{seriesLabel}</Text>
        </View>
        {model.pace ? (
          <View style={styles.legendItem}>
            <View style={styles.swatchDashed} />
            <Text style={styles.legendText}>
              {t('composerUsage.chart.legendPace', 'Even pace to reset')}
            </Text>
          </View>
        ) : null}
        <View style={styles.legendItem}>
          <View style={[styles.swatchDot, { backgroundColor: color }]} />
          <Text style={styles.legendText}>
            {t('composerUsage.chart.legendFirst', 'First reading')}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <Svg width={12} height={10}>
            <Rect
              x={0.5}
              y={0.5}
              width={11}
              height={9}
              stroke={colors.textMuted}
              strokeOpacity={0.5}
              strokeWidth={1}
              fill="none"
            />
            <Path
              d="M0,6 l6,-6 M3,10 l8,-8 M9,10 l3,-3"
              stroke={colors.textMuted}
              strokeOpacity={0.6}
              strokeWidth={1}
            />
          </Svg>
          <Text style={styles.legendText}>
            {t('composerUsage.chart.legendNoData', 'No data (Orca not reading usage)')}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  wrap: {
    gap: spacing.xs
  },
  caption: {
    fontSize: typography.metaSize,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums']
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.xxs
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  legendText: {
    fontSize: typography.captionSize,
    color: colors.textSecondary
  },
  swatchLine: {
    width: 14,
    height: 2,
    borderRadius: 1
  },
  swatchDashed: {
    width: 14,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textSecondary
  },
  swatchDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  }
}))
