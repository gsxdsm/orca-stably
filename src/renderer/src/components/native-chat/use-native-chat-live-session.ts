import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import type {
  AgentType,
  NativeChatMessage,
  NativeChatSession
} from '../../../../shared/native-chat-types'
import { mergeNativeChatLiveSession } from './native-chat-live-status'

export type UseNativeChatLiveSessionArgs = {
  /** Composite `${tabId}:${leafId}` key — selects the live hook entry. */
  paneKey: string
  agent: AgentType
  /** The agent's own session id, or null before the agent has reported one.
   *  With null there is nothing to read/tail; the view shows live hook state. */
  sessionId: string | null
}

let subscriptionCounter = 0

function nextSubscriptionId(): string {
  subscriptionCounter += 1
  return `native-chat-${subscriptionCounter}-${Date.now()}`
}

type ReadState =
  | { phase: 'loading' }
  | { phase: 'ready'; messages: NativeChatMessage[] }
  | { phase: 'error'; error: string }

/**
 * Renderer hook that streams a NativeChatSession for a pane: initial full read
 * via `nativeChat.readSession`, live tail via `nativeChat.subscribe`, merged
 * with the pane's live hook turn-state. IO + store reads live here; the merge
 * itself stays pure (mergeNativeChatLiveSession → assembleNativeChatSession).
 *
 * Remote/SSH: `nativeChat.readSession`/`subscribe` are main-process IPC, so the
 * transcript is read against the runtime's home dir (local or server-side) on
 * main — the renderer is transport-agnostic and needs no remote branch here.
 *
 * Teardown: the subscription is closed on unmount and whenever agent/sessionId
 * change, so a toggle back to terminal or a session swap never leaks a watcher.
 */
export function useNativeChatLiveSession(args: UseNativeChatLiveSessionArgs): NativeChatSession {
  const { paneKey, agent, sessionId } = args
  const [read, setRead] = useState<ReadState>({ phase: 'loading' })

  // Appended messages accumulate separately from the initial read so a re-read
  // (session change) doesn't lose in-flight appends mid-swap; they reset with
  // the same effect that re-subscribes.
  const [appended, setAppended] = useState<NativeChatMessage[]>([])

  // Live hook state for this pane, selected narrowly so unrelated status churn
  // doesn't re-render the chat view.
  const hookState = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.state ?? null)

  const latestSessionId = useRef<string | null>(sessionId)
  latestSessionId.current = sessionId

  useEffect(() => {
    if (!sessionId) {
      // No session id yet: nothing to read or tail. Surface live hook state on
      // an empty transcript; backfills once the id arrives (effect re-runs).
      setRead({ phase: 'ready', messages: [] })
      setAppended([])
      return
    }

    let cancelled = false
    setRead({ phase: 'loading' })
    setAppended([])

    void window.api?.nativeChat
      ?.readSession(agent, sessionId)
      .then((result) => {
        if (cancelled) {
          return
        }
        if (result && 'error' in result) {
          setRead({ phase: 'error', error: result.error })
          return
        }
        setRead({ phase: 'ready', messages: result?.messages ?? [] })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRead({ phase: 'error', error: err instanceof Error ? err.message : String(err) })
        }
      })

    const subscriptionId = nextSubscriptionId()
    const unsubscribe = window.api?.nativeChat?.subscribe?.(
      { subscriptionId, agent, sessionId },
      (messages) => {
        if (!cancelled) {
          setAppended((prev) => [...prev, ...messages])
        }
      }
    )

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [agent, sessionId])

  return useMemo<NativeChatSession>(() => {
    const transcript =
      read.phase === 'ready'
        ? appended.length > 0
          ? [...read.messages, ...appended]
          : read.messages
        : []
    return mergeNativeChatLiveSession({
      sources: { transcript },
      sessionId,
      agent,
      hookState,
      loading: read.phase === 'loading',
      ...(read.phase === 'error' ? { error: read.error } : {})
    })
  }, [read, appended, sessionId, agent, hookState])
}
