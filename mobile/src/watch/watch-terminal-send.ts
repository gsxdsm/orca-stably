import { sidebarSessionTabForPane, sidebarSessionTabs } from '../host-screen/sidebar-session-tab'
import { sessionTabsListRead } from '../session/tabs/mobile-session-tab-read-operations'
import {
  openMobileNativeChatSendBudget,
  sendMobileNativeChatMessageWithOutcome
} from '../session/native-chat/composer/delivery/mobile-native-chat-send'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { WatchSendResult } from './watch-gateway'

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
}): Promise<WatchSendResult> {
  const deadline = openMobileNativeChatSendBudget()
  let snapshot: unknown
  try {
    snapshot = sessionTabsListRead.interpret(
      await sessionTabsListRead.request(
        input.client,
        { worktree: `id:${input.worktreeId}` },
        { timeoutMs: 3_000, budgetSpansConnect: true }
      )
    )
  } catch {
    return { outcome: 'unavailable' }
  }
  const terminal = watchTerminalHandleFromSessionTabs(snapshot, input.paneKey)
  if (!terminal) {
    return { outcome: 'unavailable' }
  }
  return {
    outcome: await sendMobileNativeChatMessageWithOutcome({
      client: input.client,
      terminal,
      text: input.text,
      agentPrompt: true,
      requireWriteSettlement: true,
      deadline
    })
  }
}
