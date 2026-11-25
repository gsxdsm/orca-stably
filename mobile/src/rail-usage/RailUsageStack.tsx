import { useState } from 'react'
import { ScrollView, useWindowDimensions } from 'react-native'
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
import { DUO_STATUS_GLYPH_SIZE, duoStatusGlyphMidX } from '../layout/duo-status-row'
import { useReservedRegions } from '../layout/reserved-regions'
import { useSideRailStrip } from '../layout/side-rail'
import type { SideRailStrip } from '../layout/side-rail-strip'
import { listRailUsage, railRingColumn } from './rail-usage-model'
import { RailUsageRing } from './RailUsageRing'

/** The host's usage rings for the Duo side rail; empty until it reports a provider. */
export function HostRailUsageStack({ hostId }: { hostId: string }): React.JSX.Element | null {
  const { client } = useHostClient(hostId)
  return <RailUsageStack snapshot={useAccountsSnapshot(client)} />
}

/** The rings' axis and size: the status glyph's axis, as wide as the strip allows around it. */
function useRailRingColumn(strip: SideRailStrip | null): { center: number; diameter: number } {
  const { width, height } = useWindowDimensions()
  const { occlusions } = useReservedRegions()
  if (strip === null) {
    return { center: 0, diameter: DUO_STATUS_GLYPH_SIZE }
  }
  return railRingColumn({
    strip,
    windowWidth: width,
    glyphMidX: duoStatusGlyphMidX({ windowWidth: width, windowHeight: height, strip, occlusions }),
    minDiameter: DUO_STATUS_GLYPH_SIZE
  })
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
  const strip = useSideRailStrip()
  const column = useRailRingColumn(strip)
  if (usages.length === 0 || strip === null) {
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
        contentContainerStyle={[
          styles.column,
          { paddingLeft: column.center - column.diameter / 2 }
        ]}
        showsVerticalScrollIndicator={false}
        testID="rail-usage-stack"
      >
        {usages.map((usage) => (
          <RailUsageRing
            key={usage.provider}
            usage={usage}
            now={now}
            diameter={column.diameter}
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
                segments={usages.map((usage) => ({
                  value: usage.provider,
                  label: USAGE_PROVIDER_NAMES[usage.provider]
                }))}
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
  // Every ring starts at the same inset, so all share the status glyph's axis; the padding is set inline.
  column: {
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg
  },
  tabs: {
    marginBottom: spacing.md
  }
}))
