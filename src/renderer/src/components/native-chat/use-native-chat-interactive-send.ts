import { useCallback } from 'react'
import { useAppStore } from '../../store'
import { sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'
import { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import { buildNativeChatSendBytes } from './native-chat-send'

// ESC is the agent-TUI interrupt/cancel key over the PTY (matches how the
// composer forwards Escape). Used to cancel a question or deny an approval.
const ESC = '\x1b'

export type NativeChatInteractiveSend = {
  /** Send answer text (bracketed-paste wrapped + Enter, like the composer). */
  sendAnswer: (text: string) => void
  /** Send a raw control string (e.g. an approval option number or ESC) as-is. */
  sendRaw: (raw: string) => void
  /** Send ESC to interrupt — cancels a question / denies an approval. */
  cancel: () => void
}

/**
 * Reuse the desktop composer's exact send path for the interactive cards:
 * resolve this tab's live ptyId + runtime owner settings, then write bytes via
 * `sendRuntimePtyInput` (which branches local pty:write vs remote runtime RPC,
 * so SSH panes work unchanged). Answers go through `buildNativeChatSendBytes`
 * for bracketed-paste + Enter framing; control strings (option digits, ESC) are
 * written raw so the agent reads them as keystrokes.
 */
export function useNativeChatInteractiveSend(terminalTabId: string): NativeChatInteractiveSend {
  const sendRaw = useCallback(
    (raw: string) => {
      const ptyId = useAppStore.getState().ptyIdsByTabId[terminalTabId]?.[0]
      if (!ptyId) {
        return
      }
      sendRuntimePtyInput(getSettingsForAgentTabRuntimeOwner(terminalTabId), ptyId, raw)
    },
    [terminalTabId]
  )

  const sendAnswer = useCallback(
    (text: string) => {
      if (text.trim() === '') {
        return
      }
      // Send as ONE bracketed paste + a single Enter. Splitting into per-line
      // sends with their own Enter leaked the later answers as new prompts: the
      // structured prompt resolves on the first submit, so any extra Enter lands
      // as a fresh message.
      sendRaw(buildNativeChatSendBytes(text))
    },
    [sendRaw]
  )

  const cancel = useCallback(() => sendRaw(ESC), [sendRaw])

  return { sendAnswer, sendRaw, cancel }
}
