import { useMemo } from 'react'
import { MessageSquare, SquareTerminal } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { isMacPlatform, nativeChatToggleShortcutLabel } from './native-chat-shortcut'

/** Floating control to flip an agent terminal between the raw terminal and the
 *  native chat view. Rendered as an overlay corner button so it does not disturb
 *  the live xterm layout beneath it. */
export function NativeChatToggleButton({
  isChatViewMode,
  onToggle
}: {
  isChatViewMode: boolean
  onToggle: () => void
}): React.JSX.Element {
  const shortcutLabel = useMemo(() => nativeChatToggleShortcutLabel(isMacPlatform()), [])
  const label = isChatViewMode
    ? translate('components.native-chat.toggle.showTerminal', 'Show terminal')
    : translate('components.native-chat.toggle.showChat', 'Show chat view')
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            aria-pressed={isChatViewMode}
            onPointerDown={(event) => {
              // Why: stop the overlay's group-focus pointer handler from also
              // firing, and prevent the click from stealing terminal focus.
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
            className="absolute right-2 top-2 z-20 flex h-7 items-center gap-1.5 rounded-md border border-border bg-card/90 px-2 text-xs text-muted-foreground shadow-sm backdrop-blur hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {isChatViewMode ? (
              <SquareTerminal className="size-3.5" />
            ) : (
              <MessageSquare className="size-3.5" />
            )}
            <span>{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {label} ({shortcutLabel})
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
