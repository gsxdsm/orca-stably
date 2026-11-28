import { useState } from 'react'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import {
  ANTIGRAVITY_USAGE_SOURCES,
  normalizeAntigravityUsageSource,
  type AntigravityUsageSource
} from '../../../../../../shared/agent-usage/rate-limits/antigravity-usage-source'
import type { FeatureInteractionId } from '../../../../../../shared/feature-education/interactions/feature-interaction-catalog'
import { Label } from '../../../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select'
import { SearchableSetting } from '../../section-layout/SearchableSetting'
import type { UsageHostSettingsModel } from '../usage/use-usage-host-settings'

const SEARCH_KEYWORDS = [
  'antigravity',
  'agy',
  'usage',
  'source',
  'acp',
  'statusline',
  'status line',
  'weekly',
  'quota',
  'rate limit'
]

function sourceLabel(source: AntigravityUsageSource, t: Translate): string {
  switch (source) {
    case 'both':
      return t('accounts.antigravity.usageSource.both', 'Both (ACP + status line)')
    case 'acp':
      return t('accounts.antigravity.usageSource.acp', 'Live ACP session only')
    case 'statusline':
      return t('accounts.antigravity.usageSource.statusline', 'Passive status-line only')
  }
}

function sourceHelp(source: AntigravityUsageSource, t: Translate): string {
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

export function AntigravityUsageSourceSetting({
  usageSettings,
  recordFeatureInteraction
}: {
  usageSettings: UsageHostSettingsModel
  recordFeatureInteraction?: (feature: FeatureInteractionId) => void
}): React.JSX.Element {
  const t = useTranslate()
  const [saving, setSaving] = useState(false)
  const source = usageSettings.settings
    ? normalizeAntigravityUsageSource(usageSettings.settings.antigravityUsageSource)
    : undefined
  const editable = usageSettings.settings !== null && !saving

  const handleChange = (value: string): void => {
    if (!editable || !ANTIGRAVITY_USAGE_SOURCES.includes(value as AntigravityUsageSource)) {
      return
    }
    const next = value as AntigravityUsageSource
    if (next === source) {
      return
    }
    recordFeatureInteraction?.('usage-tracking')
    setSaving(true)
    void usageSettings.update({ antigravityUsageSource: next }).finally(() => setSaving(false))
  }

  return (
    <SearchableSetting
      title={t('accounts.antigravity.usageSource.title', 'Usage source')}
      description={t(
        'accounts.antigravity.usageSource.description',
        'Choose how Orca reads Antigravity 5-hour and weekly usage quotas.'
      )}
      keywords={SEARCH_KEYWORDS}
      className="space-y-2 py-3"
    >
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="antigravity-usage-source" className="min-w-0">
          {t('accounts.antigravity.usageSource.title', 'Usage source')}
        </Label>
        <Select value={source ?? ''} onValueChange={handleChange} disabled={!editable}>
          <SelectTrigger id="antigravity-usage-source" size="sm" className="w-[220px] shrink-0">
            <SelectValue
              placeholder={t(
                'accounts.antigravity.usageSource.unavailable',
                'Host setting unavailable'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {ANTIGRAVITY_USAGE_SOURCES.map((option) => (
              <SelectItem key={option} value={option}>
                {sourceLabel(option, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {source ? <p className="text-xs text-muted-foreground">{sourceHelp(source, t)}</p> : null}
    </SearchableSetting>
  )
}
