import { useCallback } from 'react'
import { useAppStore } from '../../store'
import { sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'
import { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import { sendNativeChatAnswer } from './native-chat-runtime-send'

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
 * so SSH panes work unchanged). Answers go through `sendNativeChatMessage`
 * (bracketed-paste framed body, then a separate delayed Enter); control strings
 * (option digits, ESC) are written raw so the agent reads them as keystrokes.
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
      const ptyId = useAppStore.getState().ptyIdsByTabId[terminalTabId]?.[0]
      if (!ptyId) {
        return
      }
      // Claude Code's AskUserQuestion is a MULTI-STEP prompt: one question per
      // step, each Enter advances to the next, the final Enter submits. So a
      // multi-line answer (one line per question, as `formatAskAnswer` builds
      // it) must be sent as a per-question sequence — body then its own Enter,
      // paced so each Enter lands on its rendered question and only the last
      // submits. A single-line answer stays one body + one delayed Enter.
      const lines = text.split('\n')
      sendNativeChatAnswer(getSettingsForAgentTabRuntimeOwner(terminalTabId), ptyId, lines)
    },
    [terminalTabId]
  )

  const cancel = useCallback(() => sendRaw(ESC), [sendRaw])

  return { sendAnswer, sendRaw, cancel }
}
