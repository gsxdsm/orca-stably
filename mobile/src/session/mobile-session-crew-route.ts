import { useCallback } from 'react'

/** Session route for a tapped crew or transcript sender. */
export function mobileSenderSessionPath(
  hostId: string,
  worktreeId: string,
  paneKey: string,
  executionHost?: string
): string {
  const execution = executionHost ? `&executionHost=${encodeURIComponent(executionHost)}` : ''
  return `/h/${encodeURIComponent(hostId)}/session/${encodeURIComponent(worktreeId)}?paneKey=${encodeURIComponent(paneKey)}${execution}`
}

export function useMobileSenderRoute(
  router: { push: (path: string) => void },
  hostId: string,
  executionHost?: string
): (worktreeId: string, paneKey: string) => void {
  return useCallback(
    (senderWorktreeId, paneKey) => {
      router.push(mobileSenderSessionPath(hostId, senderWorktreeId, paneKey, executionHost))
    },
    [router, hostId, executionHost]
  )
}

/** Terminal handle for the crew subscription. Agent chats subscribe by session id instead. */
export function mobileCrewTerminal(
  tab: { type?: string; terminal?: string | null } | null | undefined
): string | null {
  return tab?.type === 'terminal' ? (tab.terminal ?? null) : null
}
