import { useMemo } from 'react'
import { MessageSquare, TriangleAlert } from 'lucide-react'
import { useAppStore } from '../../store'
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
  const viewState = selectNativeChatViewState(session)

  // No on-disk session id means the conversation is degraded/approximate: the
  // transcript can't be read, so the banner signals reduced fidelity (R9).
  const isApproximate = sessionId === null

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
          <NativeChatMessageList session={session} isWorking={viewState.isWorking} />
        )}
      </div>
      {/* U8: rich native input. canSend defaults true; U9 threads the mobile
          presence-lock state through this prop. */}
      <NativeChatComposer terminalTabId={terminalTabId} agent={agent} />
    </div>
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
