import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import type {
  AgentType,
  NativeChatMessage,
  NativeChatSession
} from '../../../../shared/native-chat-types'
import { mergeNativeChatLiveSession } from './native-chat-live-status'
import {
  hasMoreNativeChatHistory,
  NATIVE_CHAT_INITIAL_LIMIT,
  nextNativeChatLimit
} from './native-chat-pagination'

export type UseNativeChatLiveSessionArgs = {
  /** Composite `${tabId}:${leafId}` key — selects the live hook entry. */
  paneKey: string
  agent: AgentType
  /** The agent's own session id, or null before the agent has reported one.
   *  With null there is nothing to read/tail; the view shows live hook state. */
  sessionId: string | null
}

/** A live session plus the older-history pagination controls the view needs. */
export type NativeChatLiveSession = NativeChatSession & {
  /** True when an older page may still exist (the last read filled the window). */
  hasMore: boolean
  /** Whether an older-history page is currently loading. */
  loadingEarlier: boolean
  /** Grow the read window to page in older history (scrolled-to-top trigger). */
  loadEarlier: () => void
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
 * Renderer hook that streams a NativeChatSession for a pane: initial windowed
 * read via `nativeChat.readSession`, live tail via `nativeChat.subscribe`, merged
 * with the pane's live hook turn-state. IO + store reads live here; the merge
 * itself stays pure (mergeNativeChatLiveSession → assembleNativeChatSession).
 *
 * Pagination: the read is windowed to the most recent `limit` turns (default
 * NATIVE_CHAT_INITIAL_LIMIT). `loadEarlier` raises the limit by a page and
 * re-reads to prepend older history; `hasMore` reflects whether the last read
 * filled the window. Read results replace the base list (they are an ordered
 * tail), while live appends accumulate separately so a re-read never drops them.
 *
 * Remote/SSH: `nativeChat.readSession`/`subscribe` are main-process IPC, so the
 * transcript is read against the runtime's home dir (local or server-side) on
 * main — the renderer is transport-agnostic and needs no remote branch here.
 *
 * Teardown: the subscription is closed on unmount and whenever agent/sessionId
 * change, so a toggle back to terminal or a session swap never leaks a watcher.
 */
export function useNativeChatLiveSession(
  args: UseNativeChatLiveSessionArgs
): NativeChatLiveSession {
  const { paneKey, agent, sessionId } = args
  const [read, setRead] = useState<ReadState>({ phase: 'loading' })
  const [hasMore, setHasMore] = useState(false)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  // The active read window; raised by loadEarlier to page in older history.
  const limitRef = useRef(NATIVE_CHAT_INITIAL_LIMIT)

  // Appended messages accumulate separately from the initial read so a re-read
  // (session change or load-earlier) doesn't lose in-flight appends mid-swap;
  // they reset with the same effect that re-subscribes.
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
      setHasMore(false)
      return
    }

    let cancelled = false
    limitRef.current = NATIVE_CHAT_INITIAL_LIMIT
    setRead({ phase: 'loading' })
    setAppended([])
    setHasMore(false)

    void window.api?.nativeChat
      ?.readSession(agent, sessionId, limitRef.current)
      .then((result) => {
        if (cancelled) {
          return
        }
        if (result && 'error' in result) {
          setRead({ phase: 'error', error: result.error })
          return
        }
        const messages = result?.messages ?? []
        setRead({ phase: 'ready', messages })
        setHasMore(hasMoreNativeChatHistory(messages.length, limitRef.current))
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
      // Desktop returns a sync unsubscribe fn; the web RPC bridge returns a
      // Promise instead (and can't deliver streaming callbacks). Calling a
      // Promise as a function crashed the whole chat view, so resolve it first
      // and only call the result when it's actually a function.
      const teardown = unsubscribe as unknown
      if (typeof teardown === 'function') {
        ;(teardown as () => void)()
      } else if (teardown && typeof (teardown as { then?: unknown }).then === 'function') {
        void (teardown as Promise<unknown>).then((fn) => {
          if (typeof fn === 'function') {
            ;(fn as () => void)()
          }
        })
      }
    }
  }, [agent, sessionId])

  const loadEarlier = useCallback(() => {
    if (!sessionId || loadingEarlier || !hasMore || read.phase !== 'ready') {
      return
    }
    const nextLimit = nextNativeChatLimit(limitRef.current)
    setLoadingEarlier(true)
    void window.api?.nativeChat
      ?.readSession(agent, sessionId, nextLimit)
      .then((result) => {
        // Ignore a stale resolve from a session that swapped underneath us.
        if (latestSessionId.current !== sessionId) {
          return
        }
        if (!result || 'error' in result) {
          return
        }
        limitRef.current = nextLimit
        // Read results are an ordered tail — replace the base list so the older
        // page prepends in order; live appends stay in their separate bucket.
        setRead({ phase: 'ready', messages: result.messages })
        setHasMore(hasMoreNativeChatHistory(result.messages.length, nextLimit))
      })
      .finally(() => {
        // Always clear the loading flag — even after a session swap — so a stale
        // resolve can't leave loadingEarlier stuck true on the new session. Only
        // APPLYING the result above is gated on the session-id match.
        setLoadingEarlier(false)
      })
  }, [agent, sessionId, hasMore, loadingEarlier, read.phase])

  return useMemo<NativeChatLiveSession>(() => {
    const transcript =
      read.phase === 'ready'
        ? appended.length > 0
          ? [...read.messages, ...appended]
          : read.messages
        : []
    const session = mergeNativeChatLiveSession({
      sources: { transcript },
      sessionId,
      agent,
      hookState,
      loading: read.phase === 'loading',
      ...(read.phase === 'error' ? { error: read.error } : {})
    })
    return { ...session, hasMore, loadingEarlier, loadEarlier }
  }, [read, appended, sessionId, agent, hookState, hasMore, loadingEarlier, loadEarlier])
}
