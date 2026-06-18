import { translate } from '@/i18n/i18n'

/** Animated three-dot "agent is working" row, shown while the active agent is
 *  still producing a reply. Pure presentation — visibility is the caller's call.
 *  Desktop parity with MobileAgentWorkingIndicator. */
export function NativeChatWorkingIndicator(): React.JSX.Element {
  return (
    <div
      className="flex items-center gap-2 text-xs italic text-muted-foreground"
      aria-live="polite"
    >
      <span>{translate('components.native-chat.status.working', 'Agent is working')}</span>
      <span className="flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70"
            // Stagger the three dots so they ripple rather than pulse in unison.
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
    </div>
  )
}
