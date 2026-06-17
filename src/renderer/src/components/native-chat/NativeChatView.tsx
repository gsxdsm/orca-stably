import { MessageSquare } from 'lucide-react'
import { translate } from '@/i18n/i18n'

/** Placeholder native chat surface (U1). Later units replace this body with the
 *  assembled conversation + composer. It exists now so the per-tab view-mode
 *  toggle is wired end-to-end while the live TerminalPane stays mounted behind
 *  it. Styled with shadcn tokens from src/renderer/src/assets/main.css. */
export default function NativeChatView(): React.JSX.Element {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <MessageSquare className="size-6" />
      </div>
      <p className="text-sm font-medium text-foreground">
        {translate('components.native-chat.NativeChatView.title', 'Native chat view')}
      </p>
      <p className="max-w-xs text-xs text-muted-foreground">
        {translate(
          'components.native-chat.NativeChatView.subtitle',
          'A structured conversation view for this agent is coming soon. The terminal keeps running underneath — toggle back any time.'
        )}
      </p>
    </div>
  )
}
