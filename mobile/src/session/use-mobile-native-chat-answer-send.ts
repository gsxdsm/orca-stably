import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { scheduleMobileClaudeAnswer } from './mobile-native-chat-answer-stepping'

/** Sends an AskUserQuestion answer to the active chat pane, with Claude's
 *  multi-step stepping. Extracted from the session route to keep that file under
 *  its line cap and to own the pending-timer lifecycle in one place. */
export type MobileNativeChatAnswerSend = {
  /** Answer the current question(s). Multi-line Claude answers step per question
   *  (body then a delayed Enter); single-line / non-Claude send one body + Enter. */
  answerAsk: (text: string) => void
  /** Drop any in-flight per-question writes (call on Stop). */
  cancelPending: () => void
}

/**
 * Owns the per-question answer-send sequence for the mobile native chat. Reads
 * the live pane/agent through refs (the route already keeps them current) so the
 * returned callbacks stay stable. The scheduled setTimeout chain is cancelled on
 * a new answer, on `cancelPending` (Stop), and on unmount / session swap — so a
 * detached chain can never write PTY bytes to a stale pane.
 */
export function useMobileNativeChatAnswerSend(args: {
  client: RpcClient | null
  handleRef: MutableRefObject<string | null>
  deviceTokenRef: MutableRefObject<string | null>
  agentRef: MutableRefObject<string | null>
  /** Changes on chat session swap; cancels pending writes when it does. */
  sessionId: string | null
}): MobileNativeChatAnswerSend {
  const { client, handleRef, deviceTokenRef, agentRef, sessionId } = args
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const cancelPending = useCallback(() => {
    for (const timer of timersRef.current) {
      clearTimeout(timer)
    }
    timersRef.current = []
  }, [])

  // Cancel pending writes on unmount and whenever the chat session swaps.
  useEffect(() => cancelPending, [sessionId, cancelPending])

  const answerAsk = useCallback(
    (text: string) => {
      const handle = handleRef.current
      if (!client || !handle) {
        return
      }
      // A new answer supersedes any still-pending per-question writes.
      cancelPending()
      const clientField = deviceTokenRef.current
        ? { client: { id: deviceTokenRef.current, type: 'mobile' as const } }
        : {}
      const sendTerminal = (body: string, enter: boolean): void => {
        void client
          .sendRequest('terminal.send', { terminal: handle, text: body, enter, ...clientField })
          .catch(() => {})
      }
      const lines = text.split('\n')
      // Only Claude renders one question per step and advances on each Enter, so
      // a multi-line answer is paced per question; non-Claude submits in one Enter.
      if (agentRef.current !== 'claude' || lines.length <= 1) {
        sendTerminal(text, true)
        return
      }
      timersRef.current = scheduleMobileClaudeAnswer(
        lines,
        (line) => sendTerminal(line, false),
        () => sendTerminal('', true)
      )
    },
    [client, handleRef, deviceTokenRef, agentRef, cancelPending]
  )

  return { answerAsk, cancelPending }
}
