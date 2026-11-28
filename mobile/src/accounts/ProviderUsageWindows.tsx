import { View } from 'react-native'
import {
  getUsageWindowSections,
  type UsageWindowSection
} from '../../../src/shared/agent-usage/display/usage-provider-windows'
import { getAccountUsageWindowLabel } from './usage/usage-window-label'
import { UsageBar } from './usage/UsageBar'
import { getUsageBarState, getWindowResetLabel } from './usage/usage-selectors'
import type { ProviderRateLimits } from './accounts-snapshot'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { spacing } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'

const EMPTY_SECTIONS: UsageWindowSection[] = [
  { kind: 'session', window: null },
  { kind: 'weekly', window: null }
]

/** One bar per usage window desktop shows for this provider. */
export function ProviderUsageWindows({
  limits,
  now,
  isFetching,
  showEmptyWindows = false
}: {
  limits: ProviderRateLimits | null
  now: number
  isFetching?: boolean
  /** Account rows keep empty session/weekly bars so a not-yet-read account still shows its windows. */
  showEmptyWindows?: boolean
}) {
  const t = useMobileTranslation()
  const buckets = limits?.buckets ?? []
  const sections = (limits ? getUsageWindowSections(limits) : EMPTY_SECTIONS).filter(
    (section) => showEmptyWindows || section.window !== null
  )
  // Pool names can repeat when agy leaves a window unnamed, so count each name's occurrences.
  const seen = new Map<string, number>()
  return (
    <View style={styles.windows}>
      {sections.map((section) => {
        const name = section.kind === 'bucket' ? `bucket:${section.name}` : section.kind
        const occurrence = seen.get(name) ?? 0
        seen.set(name, occurrence + 1)
        const bar = getUsageBarState(limits, section.window, isFetching)
        const wide = section.kind === 'bucket'
        return (
          <UsageBar
            key={`${name}:${occurrence}`}
            label={getAccountUsageWindowLabel(section, buckets, t)}
            usedPercent={bar.usedPercent}
            unavailable={bar.unavailable}
            loading={bar.loading}
            resetText={getWindowResetLabel(section.window, now)}
            wideLabel={wide}
            style={wide ? styles.wideWindow : styles.window}
          />
        )
      })}
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  windows: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.sm,
    marginTop: spacing.xs
  },
  // Two windows share a line; a third wraps to its own.
  window: {
    flexBasis: '40%',
    flexGrow: 1
  },
  wideWindow: {
    flexBasis: '100%'
  }
}))
