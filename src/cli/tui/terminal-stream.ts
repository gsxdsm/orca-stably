import type { RuntimeTerminalState } from '../../shared/runtime-types'

/** Live tail state for a single terminal, as presented to the detail pane. */
export type TerminalTailState = {
  handle: string
  /** Bounded tail lines, oldest first. The host owns a bounded buffer, so this
   *  is not guaranteed to be full scrollback. */
  lines: string[]
  status: RuntimeTerminalState
  /** True when the host dropped older lines than `lines` contains. */
  truncated: boolean
  /** False while the stream is reconnecting or the runtime is unreachable. */
  connected: boolean
  /** Set when the runtime could not provide a recovery snapshot (e.g. a remote
   *  PTY with no main-owned state); the pane shows a degraded fallback. */
  degraded: boolean
}

/** A live source of one terminal's output. v1 ships a snapshot-polling
 *  implementation (terminal.read cursor paging); a future binary-streaming
 *  implementation can satisfy the same contract without touching the views. */
export type TerminalStream = {
  getState(): TerminalTailState
  subscribe(listener: (state: TerminalTailState) => void): () => void
  start(): void
  stop(): void
}

export function emptyTerminalTailState(handle: string): TerminalTailState {
  return {
    handle,
    lines: [],
    status: 'unknown',
    truncated: false,
    connected: false,
    degraded: false
  }
}
