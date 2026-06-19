import { MessageSquare, TriangleAlert } from 'lucide-react'
import { translate } from '@/i18n/i18n'

export function NativeChatEmptyState({
  kind,
  message
}: {
  kind: 'loading' | 'empty' | 'error' | 'not-agent'
  message?: string
}): React.JSX.Element {
  const copy = emptyStateCopy(kind, message)
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div
        className={
          kind === 'error'
            ? 'flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive'
            : 'flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground'
        }
      >
        {kind === 'error' ? (
          <TriangleAlert className="size-6" />
        ) : (
          <MessageSquare className="size-6" />
        )}
      </div>
      <p className="text-sm font-medium text-foreground">{copy.title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{copy.subtitle}</p>
    </div>
  )
}

function emptyStateCopy(
  kind: 'loading' | 'empty' | 'error' | 'not-agent',
  message?: string
): { title: string; subtitle: string } {
  switch (kind) {
    case 'loading':
      return {
        title: translate('components.native-chat.state.loading.title', 'Loading conversation…'),
        subtitle: translate(
          'components.native-chat.state.loading.subtitle',
          'Reading the agent transcript.'
        )
      }
    case 'error':
      return {
        title: translate('components.native-chat.state.error.title', 'Could not load conversation'),
        subtitle:
          message ??
          translate(
            'components.native-chat.state.error.subtitle',
            'The transcript could not be read. Toggle back to the terminal to keep working.'
          )
      }
    case 'not-agent':
      return {
        title: translate('components.native-chat.state.notAgent.title', 'No conversation here'),
        subtitle: translate(
          'components.native-chat.state.notAgent.subtitle',
          'This terminal is not running a recognized coding agent.'
        )
      }
    case 'empty':
    default:
      return {
        title: translate('components.native-chat.state.empty.title', 'No messages yet'),
        subtitle: translate(
          'components.native-chat.state.empty.subtitle',
          'Send a prompt to start the conversation. New turns appear here as the agent works.'
        )
      }
  }
}
