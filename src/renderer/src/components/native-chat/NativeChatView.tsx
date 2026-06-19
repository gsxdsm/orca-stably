import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, TriangleAlert } from 'lucide-react'
import { useAppStore } from '../../store'
import { getDriverForPty, onDriverChange } from '@/lib/pane-manager/mobile-driver-state'
import { deriveNativeChatCanSend } from './native-chat-send-eligibility'
import { translate } from '@/i18n/i18n'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { TuiAgent } from '../../../../shared/types'
import type { NativeChatSession } from '../../../../shared/native-chat-types'
import { resolveNativeChatSession } from './native-chat-pane-resolution'
import { useNativeChatLiveSession } from './use-native-chat-live-session'
import { selectNativeChatViewState } from './native-chat-view-state'
import { NativeChatMessageList } from './NativeChatMessageList'
import { NativeChatComposer } from './NativeChatComposer'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import { useNativeChatFontScale } from './use-native-chat-font-scale'
import { parseInteractivePrompt } from './native-chat-interactive-prompt'
import { nativeChatCardDismissKey } from './native-chat-dismiss-key'
import { NativeChatQuestionCard } from './NativeChatQuestionCard'
import { NativeChatApprovalCard } from './NativeChatApprovalCard'
import { NativeChatChromeRow } from './NativeChatChromeRow'
import {
  useNativeChatInteractiveSend,
  type NativeChatInteractiveSend
} from './use-native-chat-interactive-send'
import {
  pendingSendsAsMessages,
  prunePendingSends,
  type NativeChatPendingSend
} from './native-chat-pending'

export type NativeChatViewProps = {
  /** The terminal tab hosting the agent. paneKey is `${tabId}:${leafId}`. */
  terminalTabId: string
  /** Launch-time agent hint from the TerminalTab, when Orca started one. */
  launchAgent?: TuiAgent | null
}

/** Pick the live agent-status entry for this tab. A tab's panes are keyed
 *  `${tabId}:${leafId}`; the single active agent pane is the one whose paneKey
 *  carries this tab id. (Split-aware resolution refines per-leaf in U8/U9; the
 *  view today resolves the tab's agent pane.) */
function findTabAgentEntry(
  agentStatusByPaneKey: Record<string, AgentStatusEntry>,
  terminalTabId: string
): AgentStatusEntry | undefined {
  const prefix = `${terminalTabId}:`
  for (const [paneKey, entry] of Object.entries(agentStatusByPaneKey)) {
    if (paneKey.startsWith(prefix)) {
      return entry
    }
  }
  return undefined
}

/**
 * Native chat surface for an agent terminal. Resolves the pane to its agent +
 * session id, streams the assembled conversation via the U4 live-session hook,
 * and renders header, message list, live status, and all empty/loading/error
 * states. When no session id is known yet the hook surfaces live hook state on
 * an empty transcript; a true scrollback-scrape fallback (U6) is wired but only
 * runs when scrollback is obtainable — it degrades to the empty state otherwise.
 */
export default function NativeChatView({
  terminalTabId,
  launchAgent
}: NativeChatViewProps): React.JSX.Element {
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)

  const resolution = useMemo(() => {
    const entry = findTabAgentEntry(agentStatusByPaneKey, terminalTabId)
    // paneKey: prefer the live entry's key; fall back to the tab id so the hook
    // still has a stable key to select live status by before any pane reports.
    const paneKey = entry?.paneKey ?? `${terminalTabId}:`
    return resolveNativeChatSession({
      paneKey,
      launchAgent,
      ...(entry ? { agentStatusEntry: entry } : {}),
      ptyId: null
    })
  }, [agentStatusByPaneKey, terminalTabId, launchAgent])

  if (!resolution) {
    return <NativeChatEmptyState kind="not-agent" />
  }

  return (
    <NativeChatResolvedView
      paneKey={resolution.paneKey}
      agent={resolution.agent}
      sessionId={resolution.sessionId}
      terminalTabId={terminalTabId}
    />
  )
}

/**
 * Track the mobile presence-lock for this tab's live pty and derive the
 * composer's `canSend` (R8). The driver Map lives outside React for perf, so we
 * subscribe to its change events and re-read on each flip. A pty held by a
 * mobile client guards desktop sends exactly as it guards xterm input.
 */
function useNativeChatCanSend(terminalTabId: string): boolean {
  const ptyId = useAppStore((s) => s.ptyIdsByTabId[terminalTabId]?.[0] ?? null)
  const [driverTick, setDriverTick] = useState(0)
  // Why: the driver event fires for every pty; only re-derive when it targets
  // this pane's pty. ptyId is a dep so the listener re-binds on a pty swap.
  useEffect(
    () =>
      onDriverChange((event) => {
        if (event.ptyId !== ptyId) {
          return
        }
        setDriverTick((n) => n + 1)
      }),
    [ptyId]
  )
  return useMemo(() => {
    void driverTick
    return deriveNativeChatCanSend(ptyId ? getDriverForPty(ptyId) : null)
  }, [ptyId, driverTick])
}

function NativeChatResolvedView({
  paneKey,
  agent,
  sessionId,
  terminalTabId
}: {
  paneKey: string
  agent: NativeChatSession['agent']
  sessionId: string | null
  terminalTabId: string
}): React.JSX.Element {
  const session = useNativeChatLiveSession({ paneKey, agent, sessionId })
  // Live hook state for this pane, selected directly so the working indicator
  // flips the instant the agent reports 'working' — even when switching to chat
  // mid-turn before the transcript merge has caught up.
  const hookWorking = useAppStore((s) => s.agentStatusByPaneKey[paneKey]?.state === 'working')
  const canSend = useNativeChatCanSend(terminalTabId)
  // Reuse the verified composer send path for both the interactive cards and the
  // chrome-row Stop button (Stop sends ESC, the agent-TUI interrupt key).
  const interactiveSend = useNativeChatInteractiveSend(terminalTabId, agent)
  // Global expand/collapse for every tool run. Each flip re-syncs all runs; a
  // run can still be toggled individually after.
  const [toolsExpanded, setToolsExpanded] = useState(false)

  // Optimistic "queued" sends (mobile parity): a composer send is echoed
  // immediately and pruned once its real user turn lands in the transcript, so
  // the message never vanishes between send and transcript catch-up.
  const [pending, setPending] = useState<NativeChatPendingSend[]>([])
  const pendingCounter = useRef(0)
  // Reset the queue when the conversation changes so echoes never cross sessions.
  useEffect(() => {
    setPending([])
  }, [sessionId, agent])
  // Prune echoes whose real user turn is now in the transcript.
  useEffect(() => {
    setPending((prev) => prunePendingSends(prev, session.messages))
  }, [session.messages])
  const onOptimisticSend = useCallback((text: string) => {
    pendingCounter.current += 1
    setPending((prev) => [
      ...prev,
      { id: `${pendingCounter.current}`, text, sentAt: Date.now() }
    ])
  }, [])

  const sessionWithPending = useMemo<typeof session>(() => {
    if (pending.length === 0) {
      return session
    }
    return { ...session, messages: [...session.messages, ...pendingSendsAsMessages(pending)] }
  }, [session, pending])
  const pendingMessageIds = useMemo(
    () => new Set(pending.map((entry) => `pending:${entry.id}`)),
    [pending]
  )
  // Derive the view state from the pending-augmented session so a send into an
  // otherwise-empty conversation flips to the list (showing the queued bubble)
  // instead of staying on the empty state.
  const viewState = selectNativeChatViewState(sessionWithPending)

  // No on-disk session id means the conversation is degraded/approximate: the
  // transcript can't be read, so the banner signals reduced fidelity (R9).
  const isApproximate = sessionId === null
  const isConversation = viewState.kind === 'ready'
  // Drive "working" from the live hook state too: when toggling to chat while the
  // agent is mid-turn, the merged transcript may not yet reflect the in-flight
  // turn, but the hook already says 'working' — show the indicator immediately.
  const isWorking = isConversation && ((viewState.kind === 'ready' && viewState.isWorking) || hookWorking)

  // Chat-only font zoom via Cmd/Ctrl +/-/0, gated to the live conversation so
  // the chord is inert on the loading/empty/error states and elsewhere.
  const fontScale = useNativeChatFontScale(isConversation)

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <NativeChatHeader agent={agent} isApproximate={isApproximate} />
      <div className="flex min-h-0 flex-1 flex-col">
        {viewState.kind === 'loading' ? (
          <NativeChatEmptyState kind="loading" />
        ) : viewState.kind === 'error' ? (
          <NativeChatEmptyState kind="error" message={viewState.message} />
        ) : viewState.kind === 'empty' ? (
          <NativeChatEmptyState kind="empty" />
        ) : (
          <NativeChatMessageList
            session={sessionWithPending}
            isWorking={isWorking}
            expandSignal={toolsExpanded}
            fontScale={fontScale.scale}
            pendingMessageIds={pendingMessageIds}
          />
        )}
      </div>
      {/* Live interactive cards (question / approval) render just above the
          composer while the agent's interactivePrompt is present (mobile parity). */}
      <NativeChatInteractiveCard paneKey={paneKey} send={interactiveSend} canSend={canSend} />
      {/* Chrome row locked to the top of the composer area (mobile parity): the
          working indicator + tool-calls toggle on the left, Stop on the far right.
          Stop interrupts via the same ESC path the composer uses. */}
      {isConversation ? (
        <NativeChatChromeRow
          isWorking={isWorking}
          toolsExpanded={toolsExpanded}
          onToggleTools={() => setToolsExpanded((v) => !v)}
          onStop={interactiveSend.cancel}
        />
      ) : null}
      {/* canSend reflects the mobile presence-lock: when a mobile client holds
          the pty, the composer shows its guarded state instead of racing the
          mobile driver (R8). */}
      <NativeChatComposer
        terminalTabId={terminalTabId}
        agent={agent}
        canSend={canSend}
        onOptimisticSend={onOptimisticSend}
      />
    </div>
  )
}

/**
 * Render the live interactive card for the pane while the agent's
 * `interactivePrompt` is present: a question wizard (precedence) or a tool
 * approval. Cleared by the host once the agent moves on, so it disappears
 * automatically. Sends through the composer's verified runtime path (R8/R6):
 * answers as bracketed-paste + Enter; cancel/deny as ESC. Guarded by `canSend`
 * so a mobile presence-lock blocks desktop sends the same way it guards xterm.
 *
 * Dismiss-on-answer (mobile parity): the live status lingers after answering —
 * the agent emits a post-tool event carrying the same prompt — so we track the
 * answered prompt by content key and hide the card until a genuinely different
 * prompt arrives. The dismissal resets once the prompt clears, so a later
 * (even identical) prompt shows again instead of staying hidden.
 */
function NativeChatInteractiveCard({
  paneKey,
  send,
  canSend
}: {
  paneKey: string
  send: NativeChatInteractiveSend
  canSend: boolean
}): React.JSX.Element | null {
  const interactivePrompt = useAppStore(
    (s) => s.agentStatusByPaneKey[paneKey]?.interactivePrompt ?? null
  )
  // Thread the sibling `toolName` from the same status entry so the question
  // parser can dispatch through the tool's registered parser (mobile parity).
  const interactiveToolName = useAppStore(
    (s) => s.agentStatusByPaneKey[paneKey]?.toolName ?? null
  )
  const { sendAnswer, sendRaw, cancel } = send

  const card = useMemo(
    () => parseInteractivePrompt(interactivePrompt, interactiveToolName ?? undefined),
    [interactivePrompt, interactiveToolName]
  )
  const cardKey = useMemo(() => nativeChatCardDismissKey(card), [card])
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  // Forget the dismissal once the prompt clears so a fresh prompt can show.
  const present = card != null
  useEffect(() => {
    if (!present) {
      setDismissedKey(null)
    }
  }, [present])

  if (!card || !canSend || cardKey === dismissedKey) {
    return null
  }
  if (card.kind === 'question') {
    return (
      <NativeChatQuestionCard
        key={cardKey ?? 'question'}
        prompt={card.prompt}
        onAnswer={(text) => {
          setDismissedKey(cardKey)
          sendAnswer(text)
        }}
        onCancel={() => {
          setDismissedKey(cardKey)
          cancel()
        }}
      />
    )
  }
  return (
    <NativeChatApprovalCard
      approval={card.approval}
      onChoose={(raw) => {
        setDismissedKey(cardKey)
        sendRaw(raw)
      }}
    />
  )
}

function NativeChatHeader({
  agent,
  isApproximate
}: {
  agent: NativeChatSession['agent']
  isApproximate: boolean
}): React.JSX.Element {
  return (
    <header className="shrink-0 border-b border-border">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-2 sm:px-4">
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium text-foreground">
          {formatAgentTypeLabel(agent)}
        </span>
      </div>
      {isApproximate ? (
        <div className="flex items-center gap-1.5 border-t border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground sm:px-4">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span>
            {translate(
              'components.native-chat.approximateBanner',
              'Approximate view — no transcript available yet, so this reflects live status only.'
            )}
          </span>
        </div>
      ) : null}
    </header>
  )
}

function NativeChatEmptyState({
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
