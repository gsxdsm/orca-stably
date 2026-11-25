import { sidebarSessionTabForPane, sidebarSessionTabs } from '../host-screen/sidebar-session-tab'
import { sessionTabsListRead } from '../session/tabs/mobile-session-tab-read-operations'
import { nativeChatTerminalWrite } from '../terminal/session/mobile-session-terminal-operations'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'

/** The phone session screen's handle: the ready terminal tab for this pane, never the pane key. */
export function watchTerminalHandleFromSessionTabs(
  snapshot: unknown,
  paneKey: string
): string | null {
  const tabs = sidebarSessionTabs(snapshot)
  if (!tabs) {
    return null
  }
  const tab = sidebarSessionTabForPane(tabs, paneKey)
  if (!tab || tab.type !== 'terminal' || !tab.terminal) {
    return null
  }
  return tab.terminal
}

export async function sendWatchTerminalText(input: {
  client: RpcClient
  worktreeId: string
  paneKey: string
  text: string
}): Promise<boolean> {
  let snapshot: unknown
  try {
    snapshot = sessionTabsListRead.interpret(
      await sessionTabsListRead.request(input.client, { worktree: `id:${input.worktreeId}` })
    )
  } catch {
    return false
  }
  const terminal = watchTerminalHandleFromSessionTabs(snapshot, input.paneKey)
  if (!terminal) {
    return false
  }
  try {
    const response = await nativeChatTerminalWrite.request(input.client, {
      terminal,
      text: input.text,
      enter: true,
      agentPrompt: true
    })
    return nativeChatTerminalWrite.interpret(response) === true
  } catch {
    return false
  }
}
