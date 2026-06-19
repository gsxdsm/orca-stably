import { MessageSquare, TriangleAlert } from 'lucide-react'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import { translate } from '@/i18n/i18n'
import type { NativeChatSession } from '../../../../shared/native-chat-types'

export function NativeChatHeader({
  agent,
  isApproximate
}: {
  agent: NativeChatSession['agent']
  isApproximate: boolean
}): React.JSX.Element {
  return (
    <header className="shrink-0 border-b border-border">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-2 sm:px-4">
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium text-foreground">
          {formatAgentTypeLabel(agent)}
        </span>
      </div>
      {isApproximate ? (
        <div className="flex items-center gap-1.5 border-t border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground sm:px-4">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span>
            {translate(
              'components.native-chat.approximateBanner',
              'Approximate view — no transcript available yet, so this reflects live status only.'
            )}
          </span>
        </div>
      ) : null}
    </header>
  )
}
