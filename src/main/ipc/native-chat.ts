import { DESKTOP_READ_WINDOW } from '../native-chat/transcript-watching/transcript-watch-contract'
import { ipcMain, type IpcMainEvent } from 'electron'
import type { AgentType } from '../../shared/agent-status/contracts/agent-status-types'
import type {
  NativeChatMessage,
  NativeChatTurnLifecycle
} from '../../shared/native-chat/native-chat-types'
import type { NativeChatSubagentActivity } from '../../shared/native-chat/input/native-chat-activity'
import type { NativeChatTaskSeedList } from '../../shared/native-chat/input/native-chat-claude-task-updates'
import { clearNativeChatTranscriptCache } from '../native-chat/transcript-read-cache'
import { nativeChatReadSessionBounds } from './native-chat-read-bounds'
import { readNativeChatTranscriptTail } from '../native-chat/transcript-live-tail'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/host/structured-agent-session-registry'
import { openNativeChatTranscript } from '../native-chat/transcript-discovery/native-chat-open-wake'
import type { IpcHandleRegistrar } from './lazy-ipc-handle-group'
import {
  _getNativeChatPendingSubscriptionCountForTest,
  _getNativeChatSenderCleanupCountForTest,
  clearNativeChatSubscriptions,
  handleSubscribe,
  teardownSubscription
} from './native-chat-subscribe'

export { clearNativeChatTranscriptCache }
export {
  _getNativeChatPendingSubscriptionCountForTest,
  _getNativeChatSenderCleanupCountForTest,
  clearNativeChatSubscriptions,
  teardownSubscription
}

export type NativeChatReadSessionArgs = {
  agent: AgentType
  sessionId: string
  /** Recent-turn window; increase it to page backward. */
  limit?: number
  /** Hook-authoritative path when session IDs no longer identify transcript filenames. */
  transcriptPath?: string
  /** The user opened or paged this chat: may start its stopped WSL distro (E9). Absent never does. */
  wakeWslDistro?: boolean
  /** Byte offset of an older page. Absent reads the newest window. */
  beforeOffset?: number
  /** One child. Absent reads the parent. */
  subagentId?: string
}

async function readSession(args: NativeChatReadSessionArgs) {
  const { agent, sessionId } = args
  const limit = args.limit && args.limit > 0 ? Math.floor(args.limit) : DESKTOP_READ_WINDOW
  const wake = args.wakeWslDistro === true
  const bounds = nativeChatReadSessionBounds(args)
  if ('error' in bounds) {
    return bounds
  }
  const { transcriptPath, waking } = openNativeChatTranscript(sessionId, args.transcriptPath, wake)
  await waking
  return readNativeChatTranscriptTail({
    agent,
    sessionId,
    transcriptPath,
    limit,
    sourceOrder: true,
    ...bounds
  })
}

export type NativeChatSubscribeArgs = {
  /** Renderer ID unique within WebContents, echoed on updates to route each viewer. */
  subscriptionId: string
  agent: AgentType
  sessionId: string
  /** Authoritative transcript path from the agent hook (providerSession). */
  transcriptPath?: string
  limit?: number
  /** The user opened this chat: may start its stopped WSL distro (E9). Absent never does. */
  wakeWslDistro?: boolean
  /** Ask for the whole-file task list. Absent keeps the frame stream unchanged. */
  capabilities?: { taskList?: 1 }
}

export type NativeChatAppendedPayload = {
  subscriptionId: string
  frame:
    | {
        type: 'snapshot'
        messages: NativeChatMessage[]
        hasMore: boolean
        error?: string
        lifecycle?: NativeChatTurnLifecycle
        /** The current window has no transcript yet; do not treat it as settled history. */
        pending?: boolean
      }
    | {
        type: 'replacement'
        messages: NativeChatMessage[]
        hasMore: boolean
        lifecycle?: NativeChatTurnLifecycle
      }
    | {
        type: 'appended'
        messages: NativeChatMessage[]
        lifecycle?: NativeChatTurnLifecycle
      }
    | {
        type: 'task-list'
        taskList: NativeChatTaskSeedList | null
        subagents?: readonly NativeChatSubagentActivity[]
      }
}

export function registerNativeChatHandleChannels(ipc: IpcHandleRegistrar = ipcMain): void {
  ipc.handle('nativeChat:readSession', (_event, args: NativeChatReadSessionArgs) =>
    readSession(args)
  )
  // Failure output is local-only because paired hosts do not transmit agent output.
  ipc.handle('nativeChat:conversationNameFailureOutput', (_event, sessionId: unknown) => {
    const naming = getStructuredAgentSessionHost()?.deps.conversationNaming
    return typeof sessionId === 'string' ? (naming?.failureOutput(sessionId) ?? null) : null
  })
}

export function handleNativeChatSubscribeEvent(
  event: IpcMainEvent,
  args: NativeChatSubscribeArgs
): void {
  void handleSubscribe(event, args)
}

export function registerNativeChatHandlers(): void {
  registerNativeChatHandleChannels(ipcMain)
  ipcMain.on('nativeChat:subscribe', handleNativeChatSubscribeEvent)
  ipcMain.on('nativeChat:unsubscribe', (event, args: { subscriptionId: string }) => {
    teardownSubscription(event.sender.id, args.subscriptionId)
  })
}
