// Pure mapping from an assembled NativeChatSession to the discrete view state the
// UI renders. Keeping it a single function (not branching inside the .tsx) makes
// the empty/loading/error/working/ready dispatch testable and keeps the render
// tree to one switch.

import type { NativeChatSession } from '../../../../shared/native-chat-types'

/** The mutually-exclusive surfaces the chat view can show. `ready` and
 *  `working` both render the message list; `working` additionally shows the
 *  live in-flight indicator. The rest are full-pane states. */
export type NativeChatViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'ready'; isWorking: false }
  | { kind: 'ready'; isWorking: true }

/**
 * Decide which surface to render. Precedence mirrors the session status the
 * assembler/live-merge already derived: error and loading are terminal; an
 * empty conversation shows the empty state even while a hook reports work (there
 * is nothing to render yet); otherwise the list renders, flagged working when
 * the session status is 'working'.
 */
export function selectNativeChatViewState(session: NativeChatSession): NativeChatViewState {
  if (session.status === 'error') {
    return { kind: 'error', message: session.error ?? 'Conversation could not be loaded.' }
  }
  if (session.status === 'loading') {
    return { kind: 'loading' }
  }
  if (session.messages.length === 0) {
    // Empty wins over a transient 'working' hook so a just-toggled, pre-session
    // pane shows a clear empty state instead of a spinner over nothing.
    return { kind: 'empty' }
  }
  if (session.status === 'working') {
    return { kind: 'ready', isWorking: true }
  }
  return { kind: 'ready', isWorking: false }
}
