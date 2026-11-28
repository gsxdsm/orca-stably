import { useState } from 'react'
import { Text, View } from 'react-native'
import { formatUsageBarValue } from '../accounts/usage/UsageBar'
import type { AccountsSnapshot } from '../accounts/accounts-snapshot'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
import { MobileSegmentedControl } from '../components/controls/MobileSegmentedControl'
import { useNow } from '../hooks/use-now'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet, useThemedStyles } from '../theme/themed-styles'
import { listRailUsage } from '../rail-usage/rail-usage-model'
import { usageProviderTabLogo } from '../rail-usage/RailUsageRing'
import {
  pickComposerUsageWindow,
  readUsageWindowHistory,
  USAGE_PROVIDER_NAMES,
  type AgentUsage,
  type UsageProviderKey
} from './agent-usage-provider'
import { useComposerUsageDisplay } from './composer-usage-display-preference'
import { composerUsageMeterReadout } from './composer-usage-meter-readout'
import { useComposerUsageWindow } from './composer-usage-window-preference'
import { ComposerUsageDisplayPicker } from './ComposerUsageDisplayPicker'
import { ComposerUsagePositionPicker } from './ComposerUsagePositionPicker'
import { ComposerUsageWindowDetail, windowTitle } from './ComposerUsageWindowDetail'
import { ComposerUsageWindowPicker } from './ComposerUsageWindowPicker'

type Props = {
  visible: boolean
  onClose: () => void
  /** Selected each time the sheet opens: the tapped rail ring's or the session's provider. */
  usage: AgentUsage
  /** Every provider's windows for the tabs, and the history the graph draws. */
  snapshot: AccountsSnapshot | null
}

/** The one usage pop-up, opened from the composer usage bar and from the Duo rail's usage rings. */

export function ComposerUsageSheet({ visible, onClose, usage, snapshot }: Props) {
  const styles = useThemedStyles(stylesSheet)
  const t = useMobileTranslation()
  const now = useNow(30_000, visible)
  const display = useComposerUsageDisplay()
  const choice = useComposerUsageWindow()
  const [providerKey, setProviderKey] = useState<UsageProviderKey>(usage.provider)
  const [windowId, setWindowId] = useState<string | null>(null)
  // The sheet stays mounted between opens, so each open reselects its entry point's provider.
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setProviderKey(usage.provider)
      setWindowId(null)
    }
  }
  const providers = listRailUsage(snapshot)
  const active = providers.find((entry) => entry.provider === providerKey) ?? usage
  const entry =
    active.windows.find((window) => window.id === windowId) ??
    pickComposerUsageWindow(active.windows, choice)
  const percent = (usedPercent: number): string =>
    formatUsageBarValue(composerUsageMeterReadout(usedPercent, display).shown, display, t)
  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      <View testID="composer-usage-sheet">
        {providers.length > 1 ? (
          <MobileSegmentedControl<UsageProviderKey>
            tabs
            onSheet
            scrollWhenCrowded
            segments={providers.map((provider) => {
              const logo = usageProviderTabLogo(provider.provider)
              const name = USAGE_PROVIDER_NAMES[provider.provider]
              return {
                value: provider.provider,
                label: logo ? '' : name,
                icon: logo,
                accessibilityLabel: name
              }
            })}
            selected={active.provider}
            onSelect={(value) => {
              setProviderKey(value)
              setWindowId(null)
            }}
            testIDPrefix="usage-provider-tab-"
            style={styles.providerTabs}
          />
        ) : null}
        <Text style={styles.heading}>
          {t('composerUsage.sheet.title', '{{provider}} usage', {
            provider: USAGE_PROVIDER_NAMES[active.provider]
          })}
        </Text>
        <Text style={styles.subtitle}>
          {active.notice ??
            t(
              'composerUsage.sheet.description',
              'Pace compares what you have used with an even burn across each window.'
            )}
        </Text>
        {active.windows.length > 1 ? (
          <MobileSegmentedControl<string>
            tabs
            onSheet
            scrollWhenCrowded
            segments={active.windows.map((window) => ({
              value: window.id,
              label: `${windowTitle(window, t)} ${percent(window.window.usedPercent)}`,
              accessibilityLabel: windowTitle(window, t)
            }))}
            selected={entry?.id}
            onSelect={setWindowId}
            testIDPrefix="composer-usage-tab-"
          />
        ) : null}
        {entry ? (
          <ComposerUsageWindowDetail
            key={`${active.provider}:${entry.id}`}
            entry={entry}
            samples={readUsageWindowHistory(snapshot, active.provider, entry.id)}
            now={now}
          />
        ) : null}
        <ComposerUsageWindowPicker windows={active.windows} />
        <ComposerUsageDisplayPicker />
        <ComposerUsagePositionPicker />
      </View>
    </BottomDrawer>
  )
}

const stylesSheet = themedStyleSheet((colors) => ({
  heading: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '700'
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    marginTop: spacing.xs,
    marginBottom: spacing.sm
  },
  providerTabs: {
    marginBottom: spacing.md
  }
}))
