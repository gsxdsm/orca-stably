import { sidebarSessionTabForPane, sidebarSessionTabs } from '../host-screen/sidebar-session-tab'
import * as z from 'zod'
import { sessionTabsListRead } from '../session/tabs/mobile-session-tab-read-operations'
import {
  openMobileNativeChatSendBudget,
  sendMobileNativeChatMessageWithOutcome
} from '../session/native-chat/composer/delivery/mobile-native-chat-send'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { WatchSendResult } from './watch-gateway'

const watchedTerminalTranscript = z.object({
  id: z.string(),
  type: z.literal('terminal'),
  agentStatus: z.object({
    agentType: z.string().optional(),
    providerSession: z.object({ id: z.string().min(1), transcriptPath: z.string().optional() })
  })
})

export async function resolveWatchTerminalTranscript(
  client: RpcClient,
  worktreeId: string,
  paneKey: string
) {
  const snapshot = await readWatchTerminalTabs(client, worktreeId)
  const tabs = sidebarSessionTabs(snapshot)
  const tab = tabs && sidebarSessionTabForPane(tabs, paneKey)
  if (
    !tab ||
    !snapshot ||
    typeof snapshot !== 'object' ||
    !('tabs' in snapshot) ||
    !Array.isArray(snapshot.tabs)
  ) {
    return null
  }
  for (const raw of snapshot.tabs) {
    const row = watchedTerminalTranscript.safeParse(raw)
    if (row.success && row.data.id === tab.id) {
      return row.data.agentStatus
    }
  }
  return null
}

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
  const terminal = await resolveWatchTerminalHandle(input.client, input.worktreeId, input.paneKey)
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

export async function resolveWatchTerminalHandle(
  client: RpcClient,
  worktreeId: string,
  paneKey: string
): Promise<string | null> {
  return watchTerminalHandleFromSessionTabs(
    await readWatchTerminalTabs(client, worktreeId),
    paneKey
  )
}

async function readWatchTerminalTabs(client: RpcClient, worktreeId: string): Promise<unknown> {
  try {
    const reply = await sessionTabsListRead.request(
      client,
      { worktree: `id:${worktreeId}` },
      { timeoutMs: 3_000, budgetSpansConnect: true }
    )
    return sessionTabsListRead.interpret(reply)
  } catch {
    return null
  }
}
