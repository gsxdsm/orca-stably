// Runtime send for native chat: writes the framed message body, then the Enter
// as a SEPARATE delayed pty write. Kept apart from the pure byte builders in
// native-chat-send.ts so those stay IO-free and unit-testable without aliases.

import { sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'
import type { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import { buildNativeChatPasteBytes, NATIVE_CHAT_SUBMIT } from './native-chat-send'

// Why: agent TUIs swallow a `\r` bundled into the same pty write as a framed
// paste, so a one-shot send leaves the text sitting in the input box, unsent.
// Write the body first, then the Enter after a short delay so the agent
// processes the paste before the submit — mirrors orca-runtime's
// writeTerminalAction({enter:true}) two-write Enter handling.
const NATIVE_CHAT_SUBMIT_DELAY_MS = 60

/**
 * Send a native-chat message through the verified runtime pty path: framed body
 * first, then a separate delayed Enter. `sendRuntimePtyInput` branches local
 * pty:write vs remote runtime RPC, so this works for SSH panes too.
 */
export function sendNativeChatMessage(
  settings: ReturnType<typeof getSettingsForAgentTabRuntimeOwner>,
  ptyId: string,
  text: string
): void {
  sendRuntimePtyInput(settings, ptyId, buildNativeChatPasteBytes(text))
  setTimeout(() => {
    sendRuntimePtyInput(settings, ptyId, NATIVE_CHAT_SUBMIT)
  }, NATIVE_CHAT_SUBMIT_DELAY_MS)
}
