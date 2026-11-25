import { useState } from 'react'
import { ScrollView } from 'react-native'
import type { AccountsSnapshot } from '../accounts/accounts-snapshot'
import { BottomDrawerModalHost } from '../components/bottom-drawer/bottom-drawer-modal-host'
import { MobileSegmentedControl } from '../components/controls/MobileSegmentedControl'
import { USAGE_PROVIDER_NAMES, type UsageProviderKey } from '../composer-usage/agent-usage-provider'
import { useAccountsSnapshot } from '../composer-usage/accounts-snapshot-store'
import { ComposerUsageSheet } from '../composer-usage/ComposerUsageSheet'
import { useNow } from '../hooks/use-now'
import { spacing } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useHostClient } from '../transport/connection/host-client-hooks'
import { listRailUsage } from './rail-usage-model'
import { RailUsageRing, usageProviderTabLogo } from './RailUsageRing'

/** The host's usage rings for the Duo side rail; empty until it reports a provider. */
export function HostRailUsageStack({ hostId }: { hostId: string }): React.JSX.Element | null {
  const { client } = useHostClient(hostId)
  return <RailUsageStack snapshot={useAccountsSnapshot(client)} />
}

/** A scrolling column of usage rings; a tap opens the usage sheet on that provider, with tabs for the rest. */
export function RailUsageStack({
  snapshot
}: {
  snapshot: AccountsSnapshot | null
}): React.JSX.Element | null {
  const usages = listRailUsage(snapshot)
  const now = useNow(60_000)
  const [selected, setSelected] = useState<UsageProviderKey | null>(null)
  // Kept after close so the sheet slides out still showing what it showed.
  const [shown, setShown] = useState<UsageProviderKey | null>(null)
  if (usages.length === 0) {
    return null
  }
  const sheetUsage = usages.find((usage) => usage.provider === shown) ?? usages[0]
  const open = (provider: UsageProviderKey): void => {
    setShown(provider)
    setSelected(provider)
  }
  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.column}
        showsVerticalScrollIndicator={false}
        testID="rail-usage-stack"
      >
        {usages.map((usage) => (
          <RailUsageRing
            key={usage.provider}
            usage={usage}
            now={now}
            onPress={() => open(usage.provider)}
          />
        ))}
      </ScrollView>
      <BottomDrawerModalHost>
        <ComposerUsageSheet
          visible={selected !== null}
          onClose={() => setSelected(null)}
          usage={sheetUsage}
          spanSideStrip
          header={
            usages.length > 1 ? (
              <MobileSegmentedControl
                segments={usages.map((usage) => {
                  const logo = usageProviderTabLogo(usage.provider)
                  const name = USAGE_PROVIDER_NAMES[usage.provider]
                  return {
                    value: usage.provider,
                    label: logo ? '' : name,
                    icon: logo,
                    accessibilityLabel: name
                  }
                })}
                selected={sheetUsage.provider}
                onSelect={setShown}
                scrollWhenCrowded
                onSheet
                tabs
                testIDPrefix="rail-usage-tab-"
                style={styles.tabs}
              />
            ) : null
          }
        />
      </BottomDrawerModalHost>
    </>
  )
}

const styles = themedStyleSheet(() => ({
  scroll: {
    flex: 1
  },
  // Room above the first ring's percent, which sits over the ring's top edge.
  column: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg
  },
  tabs: {
    marginBottom: spacing.md
  }
}))
