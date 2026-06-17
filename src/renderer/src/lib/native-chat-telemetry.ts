// Native-chat adoption telemetry emit wrappers.
//
// Why a dedicated module: the toggle action (store, `tabs.ts`) and the
// composer send path (`NativeChatComposer.tsx`, owned by another unit) both
// need to fire native-chat events, but neither should hand-build the event
// shape inline. Centralizing the `agent_kind` mapping and the
// `track(...)`-name pairing here keeps both call sites in lockstep and gives
// the composer a single import (`emitNativeChatMessageSent`) to call.

import { track, tuiAgentToAgentKind } from './telemetry'
import type { NativeChatRuntime } from '../../../shared/telemetry-events'
import type { TuiAgent } from '../../../shared/types'

// `launchAgent` is optional on terminal tabs (plain shells, manually-started
// agents). When absent we fall back to `'other'` so the closed `agent_kind`
// enum still validates instead of dropping the event.
function resolveAgentKind(
  agent: TuiAgent | null | undefined
): ReturnType<typeof tuiAgentToAgentKind> {
  return agent ? tuiAgentToAgentKind(agent) : 'other'
}

/** Fire `native_chat_toggled` when a tab flips between terminal and chat. */
export function emitNativeChatToggled(args: {
  from: 'terminal' | 'chat'
  to: 'terminal' | 'chat'
  agent: TuiAgent | null | undefined
}): void {
  track('native_chat_toggled', {
    from_mode: args.from,
    to_mode: args.to,
    agent_kind: resolveAgentKind(args.agent)
  })
}

/**
 * Fire `native_chat_message_sent` when a prompt is sent from the native
 * composer into the running agent. `runtime` is `'unknown'` when the caller
 * cannot resolve whether the owning PTY is local or remote (SSH).
 *
 * The composer (`NativeChatComposer.tsx`, owned by another unit) is the
 * intended caller — it owns the send path and the local/remote runtime
 * resolution. This unit only provides the wrapper.
 */
export function emitNativeChatMessageSent(args: {
  agent: TuiAgent | null | undefined
  runtime: NativeChatRuntime
}): void {
  track('native_chat_message_sent', {
    agent_kind: resolveAgentKind(args.agent),
    runtime: args.runtime
  })
}
