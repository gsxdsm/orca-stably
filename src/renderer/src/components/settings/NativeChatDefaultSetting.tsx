import type { GlobalSettings } from '../../../../shared/types'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'

type NativeChatDefaultSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

const TITLE = 'Open agent tabs in chat view by default'
const DESCRIPTION =
  'When on, newly launched coding-agent tabs open directly in the native chat view instead of the raw terminal. You can still toggle back to the terminal at any time.'
const SEARCH_KEYWORDS = ['chat', 'native chat', 'agent', 'view', 'terminal', 'default'] as const

export function NativeChatDefaultSetting({
  settings,
  updateSettings
}: NativeChatDefaultSettingProps): React.JSX.Element {
  // Why: optional setting for legacy-settings compatibility — treat a missing
  // value as off so the control reflects the default-false behavior.
  const enabled = settings.openAgentTabsInChatByDefault === true

  return (
    <section className="space-y-3">
      <SearchableSetting title={TITLE} description={DESCRIPTION} keywords={[...SEARCH_KEYWORDS]}>
        <div className="flex items-start justify-between gap-4 py-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <Label>{TITLE}</Label>
            <p className="text-xs text-muted-foreground">{DESCRIPTION}</p>
          </div>
          {/* Why: this button is read directly from the React element tree by
              tests that walk props (without rendering), so the role/aria
              attributes must stay on a literal <button>, not a wrapper. */}
          <button
            type="button"
            role="switch"
            aria-label={TITLE}
            aria-checked={enabled}
            onClick={() => updateSettings({ openAgentTabsInChatByDefault: !enabled })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors ${
              enabled ? 'bg-foreground' : 'bg-muted-foreground/30'
            } outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50`}
          >
            <span
              className={`pointer-events-none block size-3.5 rounded-full bg-background shadow-sm transition-transform ${
                enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </SearchableSetting>
    </section>
  )
}
