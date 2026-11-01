import type { TuiAgent } from '../../shared/tui-agent'
import { resolveDraftPasteReadyTimeoutMs } from '../../shared/draft-paste-ready-timeout'
import type { LaunchedAgentForeground } from './launched-agent-foreground'
import { readFreshComposerHold } from './launched-agent-composer-readiness'
import type { RuntimePtyWorktreeRecord } from './runtime-terminal-state-records'
import { buildTerminalWaitText } from './terminal-wait-tail-state'
import {
  waitForWorktreeStartupDraft,
  type WorktreeStartupReadinessHost
} from './runtime-worktree-startup-readiness'

// Why: a paste that lands before Claude's composer mounts stays in its input, but its Enter is lost (#34580).
const SUBMIT_WAITS_FOR_LAUNCH_COMPOSER: ReadonlySet<TuiAgent> = new Set([
  'claude',
  'claude-agent-teams',
  'hermes'
])

/** A startup dialog or hold anchor on the pane's tail or screen vetoes a ready signal. */
export function readPtyFreshComposerHold(
  pty: Pick<RuntimePtyWorktreeRecord, 'tailBuffer' | 'tailPartialLine' | 'preview'> | undefined,
  screenLines: readonly string[] | null
): 'dialog' | 'starting' | null {
  return pty
    ? readFreshComposerHold(
        buildTerminalWaitText(pty.tailBuffer, pty.tailPartialLine, pty.preview),
        screenLines
      )
    : null
}

export type FreshComposerPtyHost = {
  readiness: WorktreeStartupReadinessHost
  readHold: (ptyId: string) => 'dialog' | 'starting' | null
  readForeground: (ptyId: string, agent: TuiAgent) => Promise<LaunchedAgentForeground>
  readHermesSessionStart?: (ptyId: string, since: number) => boolean
}

async function waitForHermesSessionStart(
  host: FreshComposerPtyHost,
  ptyId: string
): Promise<boolean> {
  const since = Date.now() - 2_000
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (host.readHermesSessionStart?.(ptyId, since)) {
      return true
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
  }
  return true
}

/** An agent ready signal on one PTY with no startup dialog and no shell in front; null on timeout or stop. */
export function waitForFreshComposerOnPty(
  host: FreshComposerPtyHost,
  ptyId: string | null,
  agent: TuiAgent,
  timeoutMs: number,
  options: { requireComposerMarker: boolean; stopOnDialog: boolean; stop: AbortController }
): Promise<string | null> {
  const { stop } = options
  return waitForWorktreeStartupDraft(
    { ...host.readiness, getPtyId: () => ptyId },
    ptyId ?? '',
    agent,
    {
      timeoutMs,
      requireComposerMarker: options.requireComposerMarker,
      // Every caller pastes and then presses Enter: a worker brief, a launch prompt or a send.
      submit: true,
      signal: stop.signal,
      isShellInFront: async (ownerPtyId) =>
        (await host.readForeground(ownerPtyId, agent)) === 'shell',
      accept: (readyPtyId) => {
        const hold = host.readHold(readyPtyId)
        if (hold === 'dialog' && options.stopOnDialog) {
          stop.abort()
        }
        return hold === null
      }
    }
  )
}

/** Watched from launch: the replay buffer loses the startup marker on a busy pane, so a send cannot check it later. */
export function watchLaunchComposer(
  watches: Map<string, Promise<boolean>>,
  host: FreshComposerPtyHost,
  ptyId: string,
  agent: TuiAgent | null
): void {
  // A new launch on a reused PTY id replaces its predecessor's watch.
  if (!agent || !SUBMIT_WAITS_FOR_LAUNCH_COMPOSER.has(agent)) {
    return
  }
  const stop = new AbortController()
  const ready =
    agent === 'hermes'
      ? waitForHermesSessionStart(host, ptyId)
      : waitForFreshComposerOnPty(host, ptyId, agent, resolveDraftPasteReadyTimeoutMs(agent), {
          requireComposerMarker: false,
          stopOnDialog: true,
          stop
        }).then(
          // A startup dialog stops the watch: it takes the next input, so sends reach it as before.
          (readyPtyId) => readyPtyId !== null || stop.signal.aborted,
          () => false
        )
  watches.set(ptyId, ready)
  void ready.then(() => {
    if (watches.get(ptyId) === ready) {
      watches.delete(ptyId)
    }
  })
}
