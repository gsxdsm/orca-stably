import { useCallback } from 'react'
import { View } from 'react-native'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useThemedStyles } from '../theme/themed-styles'
import { stylesSheet } from './mobile-accounts-screen-styles'
import type { AccountsSnapshot } from './accounts-snapshot'
import { AntigravityAccountSection } from './antigravity-account-section'
import {
  ManagedDataAccountSection,
  managedDataBusyId,
  type ManagedDataProvider
} from './managed-data-account-section'
import { ProviderUsageSection } from './provider-usage-section'
import { getOtherUsageProviders } from './usage/usage-selectors'
import { MobileAgentIcon } from '../components/icons/MobileAgentIcon'
import { getProviderDisplayName } from '../../../src/shared/agent-usage/display/usage-provider-windows'
import { ProviderUsageWindows } from './ProviderUsageWindows'
import { ListGroup, SectionHeader, ListRow } from '../components/list/ListGroup'
import { UsageStatusNote } from './usage/UsageStatusNote'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'

type AccountsNotice = { title: string; message: string }

const DEDICATED_USAGE_PROVIDERS = new Set([
  'gemini',
  'opencode-go',
  'opencodeGo',
  'antigravity',
  'minimax',
  'grok',
  'cursor',
  'zcode'
])

export function MobileAccountsExtraProviders({
  snapshot,
  now,
  client,
  live,
  reloadKey,
  busyAccountId,
  disabled,
  setBusyAccountId,
  onNotice,
  onRefresh
}: {
  snapshot: AccountsSnapshot
  now: number
  client: RpcClient | null
  live: boolean
  reloadKey: number
  busyAccountId: string | null
  disabled: boolean
  setBusyAccountId: (id: string | null) => void
  onNotice: (notice: AccountsNotice) => void
  onRefresh: () => Promise<void>
}) {
  const t = useMobileTranslation()
  const selectDataAccount = useCallback(
    async (provider: ManagedDataProvider, accountId: string | null) => {
      if (!client) {
        return
      }
      setBusyAccountId(managedDataBusyId(provider, accountId))
      const title = t('accounts.screen.switchFailed', 'Could not switch account')
      try {
        const res = await client.sendRequest('accounts.selectData', { provider, accountId })
        if (!res.ok) {
          onNotice({ title, message: res.error.message })
        } else {
          await onRefresh()
        }
      } catch (e) {
        onNotice({ title, message: e instanceof Error ? e.message : String(e) })
      } finally {
        setBusyAccountId(null)
      }
    },
    [client, onNotice, onRefresh, setBusyAccountId, t]
  )

  return (
    <>
      <ManagedDataAccountSection
        provider="opencode"
        snapshot={snapshot}
        busyAccountId={busyAccountId}
        disabled={disabled}
        onSelect={(provider, accountId) => {
          void selectDataAccount(provider, accountId)
        }}
      />
      <ManagedDataAccountSection
        provider="devin"
        snapshot={snapshot}
        busyAccountId={busyAccountId}
        disabled={disabled}
        onSelect={(provider, accountId) => {
          void selectDataAccount(provider, accountId)
        }}
      />
      <ProviderUsageSection provider="gemini" snapshot={snapshot} now={now} />
      <AntigravityAccountSection
        snapshot={snapshot}
        now={now}
        client={client}
        connected={live}
        reloadKey={reloadKey}
        busyAccountId={busyAccountId}
        disabled={disabled}
        onNotice={onNotice}
        onChanged={onRefresh}
      />
      <ProviderUsageSection provider="opencodeGo" snapshot={snapshot} now={now} />
      <ProviderUsageSection provider="minimax" snapshot={snapshot} now={now} />
      <ProviderUsageSection provider="grok" snapshot={snapshot} now={now} />
      <ProviderUsageSection provider="cursor" snapshot={snapshot} now={now} />
      <ProviderUsageSection provider="zcode" snapshot={snapshot} now={now} />
      <OtherUsageProviders snapshot={snapshot} now={now} />
    </>
  )
}

// Every other provider desktop shows usage for; usage only, since accounts are managed on desktop.
function OtherUsageProviders({ snapshot, now }: { snapshot: AccountsSnapshot; now: number }) {
  const styles = useThemedStyles(stylesSheet)
  const t = useMobileTranslation()
  const providers = getOtherUsageProviders(snapshot).filter(
    (limits) => !DEDICATED_USAGE_PROVIDERS.has(limits.provider)
  )
  if (providers.length === 0) {
    return null
  }
  return (
    <View>
      <SectionHeader title={t('accounts.screen.otherAgents', 'Other agents')} />
      <ListGroup style={styles.group}>
        {providers.map((limits) => (
          <ListRow
            key={limits.provider}
            title={getProviderDisplayName(limits.provider)}
            leading={<MobileAgentIcon agentId={limits.provider} size={16} />}
            detail={
              <>
                <ProviderUsageWindows limits={limits} now={now} />
                <UsageStatusNote limits={limits} />
              </>
            }
          />
        ))}
      </ListGroup>
    </View>
  )
}
