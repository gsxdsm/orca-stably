import { useState } from 'react'
import { ScrollView, useWindowDimensions } from 'react-native'
import type { AccountsSnapshot } from '../accounts/accounts-snapshot'
import { BottomDrawerModalHost } from '../components/bottom-drawer/bottom-drawer-modal-host'
import type { UsageProviderKey } from '../composer-usage/agent-usage-provider'
import { useAccountsSnapshot } from '../composer-usage/accounts-snapshot-store'
import { ComposerUsageSheet } from '../composer-usage/ComposerUsageSheet'
import { useNow } from '../hooks/use-now'
import { spacing } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useHostClient } from '../transport/connection/host-client-hooks'
import { DUO_STATUS_RING_DIAMETER, duoStatusGlyphMidX } from '../layout/duo-status-row'
import { useReservedRegions } from '../layout/reserved-regions'
import { useSideRailStrip } from '../layout/side-rail'
import type { SideRailStrip } from '../layout/side-rail-strip'
import { listRailUsage, railRingCenter } from './rail-usage-model'
import { RailUsageRing } from './RailUsageRing'

/** The rings in a rail of their own (a tablet's), sized for its larger screen. */
export const STANDALONE_RING_DIAMETER = 60

/** The host's usage rings for the Duo side rail; empty until it reports a provider. */
export function HostRailUsageStack({ hostId }: { hostId: string }): React.JSX.Element | null {
  const { client } = useHostClient(hostId)
  return <RailUsageStack snapshot={useAccountsSnapshot(client)} />
}

/** The rings' axis: the status glyph's, so each ring sits under it. */
function useRailRingCenter(strip: SideRailStrip | null): number {
  const { width, height } = useWindowDimensions()
  const { occlusions } = useReservedRegions()
  if (strip === null) {
    return 0
  }
  return railRingCenter({
    strip,
    windowWidth: width,
    glyphMidX: duoStatusGlyphMidX({ windowWidth: width, windowHeight: height, strip, occlusions })
  })
}

/** A scrolling column of usage rings; a tap opens the usage sheet on that provider, with tabs for the rest. */
export function RailUsageStack({
  snapshot,
  standalone = false
}: {
  snapshot: AccountsSnapshot | null
  /** Centred in its own column rather than on the Duo status glyph's axis. */
  standalone?: boolean
}): React.JSX.Element | null {
  const usages = listRailUsage(snapshot)
  const now = useNow(60_000)
  const [selected, setSelected] = useState<UsageProviderKey | null>(null)
  // Kept after close so the sheet slides out still showing what it showed.
  const [shown, setShown] = useState<UsageProviderKey | null>(null)
  const strip = useSideRailStrip()
  const center = useRailRingCenter(strip)
  if (usages.length === 0 || (strip === null && !standalone)) {
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
          standalone ? styles.centered : { paddingLeft: center - DUO_STATUS_RING_DIAMETER / 2 }
        ]}
        showsVerticalScrollIndicator={false}
        testID="rail-usage-stack"
      >
        {usages.map((usage) => (
          <RailUsageRing
            key={usage.provider}
            usage={usage}
            now={now}
            diameter={standalone ? STANDALONE_RING_DIAMETER : undefined}
            onPress={() => open(usage.provider)}
          />
        ))}
      </ScrollView>
      <BottomDrawerModalHost>
        <ComposerUsageSheet
          visible={selected !== null}
          onClose={() => setSelected(null)}
          usage={sheetUsage}
          snapshot={snapshot}
          spanSideStrip
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
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg
  },
  centered: {
    alignItems: 'center',
    gap: spacing.lg
  }
}))
