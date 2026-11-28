import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import {
  ANTIGRAVITY_USAGE_SOURCES,
  type AntigravityUsageSource
} from '../../../src/shared/agent-usage/rate-limits/antigravity-usage-source'
import {
  MobileSegmentedControl,
  type MobileSegment
} from '../components/controls/MobileSegmentedControl'
import type { Translate } from '../i18n/mobile-i18n'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet, useThemedStyles } from '../theme/themed-styles'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import {
  antigravityUsageSourceRead,
  antigravityUsageSourceWrite
} from './antigravity-usage-source-operations'

function sourceSegments(t: Translate): readonly MobileSegment<AntigravityUsageSource>[] {
  return ANTIGRAVITY_USAGE_SOURCES.map((value) => ({
    value,
    label:
      value === 'both'
        ? t('accounts.antigravity.usageSource.mobileBoth', 'Both')
        : value === 'acp'
          ? t('accounts.antigravity.usageSource.mobileAcp', 'Live ACP')
          : t('accounts.antigravity.usageSource.mobileStatusLine', 'Status line')
  }))
}

function sourceDescription(source: AntigravityUsageSource, t: Translate): string {
  switch (source) {
    case 'both':
      return t(
        'accounts.antigravity.usageSource.bothHelp',
        'Reads running Antigravity chats (agy acp) and interactive agy terminal status-line updates. Freshest reading wins.'
      )
    case 'acp':
      return t(
        'accounts.antigravity.usageSource.acpHelp',
        'Reads running Antigravity chats only. Does not configure or ingest the agy CLI status line.'
      )
    case 'statusline':
      return t(
        'accounts.antigravity.usageSource.statuslineHelp',
        'Reads interactive agy terminal status-line updates only. Makes no local ACP RPC calls.'
      )
  }
}

export function useHostAntigravityUsageSource({
  client,
  connected,
  reloadKey = 0
}: {
  client: RpcClient | null
  connected: boolean
  reloadKey?: number
}): {
  source: AntigravityUsageSource | null
  saving: boolean
  select: (next: AntigravityUsageSource) => Promise<string | null>
} {
  const [source, setSource] = useState<AntigravityUsageSource | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!client || !connected) {
      setSource(null)
      return
    }
    let cancelled = false
    void antigravityUsageSourceRead
      .request(client, undefined)
      .then((response) => {
        if (cancelled) {
          return
        }
        const parsed = antigravityUsageSourceRead.interpret(response)
        setSource(parsed.accepted ? parsed.value : null)
      })
      .catch(() => {
        if (!cancelled) {
          setSource(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [client, connected, reloadKey])

  const select = async (next: AntigravityUsageSource): Promise<string | null> => {
    if (!client || !connected || saving || next === source) {
      return null
    }
    const previous = source
    setSource(next)
    setSaving(true)
    try {
      const response = await antigravityUsageSourceWrite.request(client, {
        antigravityUsageSource: next
      })
      const confirmed = antigravityUsageSourceWrite.interpret(response)
      if (confirmed) {
        setSource(confirmed)
      }
      return null
    } catch (error) {
      setSource(previous)
      return error instanceof Error ? error.message : String(error)
    } finally {
      setSaving(false)
    }
  }

  return { source, saving, select }
}

/** Segmented picker for a host's Antigravity usage source (Both / Live ACP / Status line). */
export function AntigravityUsageSourcePicker({
  source,
  saving,
  disabled = false,
  inSettings = false,
  hostName,
  onSelect
}: {
  source: AntigravityUsageSource | null
  saving: boolean
  disabled?: boolean
  inSettings?: boolean
  hostName?: string | null
  onSelect: (next: AntigravityUsageSource) => void
}): React.JSX.Element | null {
  const styles = useThemedStyles(stylesSheet)
  const t = useMobileTranslation()
  if (source === null) {
    return null
  }
  const title = hostName
    ? t('accounts.antigravity.usageSource.hostTitle', 'Antigravity usage source ({{host}})', {
        host: hostName
      })
    : t('accounts.antigravity.usageSource.title', 'Antigravity usage source')
  return (
    <View
      style={[styles.container, inSettings && styles.inSettings]}
      testID="antigravity-usage-source-picker"
    >
      <Text style={styles.label}>{title}</Text>
      <MobileSegmentedControl<AntigravityUsageSource>
        segments={sourceSegments(t)}
        selected={source}
        onSelect={(value) => {
          if (!saving && !disabled) {
            onSelect(value)
          }
        }}
        fill
        testIDPrefix="antigravity-usage-source-"
      />
      <Text style={styles.description}>{sourceDescription(source, t)}</Text>
    </View>
  )
}

const stylesSheet = themedStyleSheet((colors) => ({
  container: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  inSettings: {
    paddingHorizontal: spacing.md + 2
  },
  label: {
    fontSize: typography.bodySize,
    fontWeight: '500',
    color: colors.textPrimary
  },
  description: {
    fontSize: typography.captionSize,
    lineHeight: 16,
    color: colors.textSecondary
  }
}))
