import { ArrowUp, Paperclip, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

export type NativeChatComposerActionsProps = {
  attachDisabled: boolean
  sendDisabled: boolean
  isWorking: boolean
  onAttach: () => void
  onSend: () => void
  onStop?: () => void
}

export function NativeChatComposerActions({
  attachDisabled,
  sendDisabled,
  isWorking,
  onAttach,
  onSend,
  onStop
}: NativeChatComposerActionsProps): React.JSX.Element {
  return (
    <div className="ml-auto flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={translate('components.native-chat.composer.attach', 'Attach file')}
            disabled={attachDisabled}
            onClick={onAttach}
            className="pointer-coarse:size-11"
          >
            <Paperclip className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {translate('components.native-chat.composer.attach', 'Attach file')}
        </TooltipContent>
      </Tooltip>
      <Button
        type="button"
        aria-label={
          isWorking
            ? translate('components.native-chat.stop', 'Stop the agent')
            : translate('components.native-chat.composer.send', 'Send')
        }
        disabled={sendDisabled}
        onClick={isWorking ? onStop : onSend}
        variant={isWorking ? 'secondary' : 'default'}
        size="icon"
        className="pointer-coarse:size-11"
      >
        {isWorking ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
      </Button>
    </div>
  )
}
