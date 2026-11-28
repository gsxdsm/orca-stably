import type * as Notifications from 'expo-notifications'
import { parseExecutionHostId } from '../../../src/shared/execution-host/execution-host'
import { sha256 } from '../../../src/shared/hashing/sha256'
import { loadHosts } from '../host-catalog/host-store'
import { readNativeNotificationData } from '../notifications/payload-identity/native-notification-data'
import { resolveHostIdForFingerprint } from '../notifications/payload-identity/push-host-fingerprint'
import { readOrcaPushPayload } from '../notifications/payload-identity/push-payload'
import { openHostLogicalClient } from '../transport/connection/host-logical-client'
import { scopeRpcClientToExecutionHost } from '../worktree/execution-hosts/execution-host-scoped-rpc-client'
import { agentPromptListPending, agentPromptRespond } from './watch-agent-prompt-operations'

import { MOBILE_PUSH_PROMPT_CATEGORY } from '../../../src/shared/notifications/mobile-push-contract'
import { APPROVE_WATCH_PROMPT_ACTION, DENY_WATCH_PROMPT_ACTION } from './watch-prompt-category'

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

async function respondToWatchPrompt(
  response: Notifications.NotificationResponse
): Promise<boolean> {
  const role = response.actionIdentifier
  if (role !== APPROVE_WATCH_PROMPT_ACTION && role !== DENY_WATCH_PROMPT_ACTION) {
    return false
  }
  const request = response.notification.request
  const data = readNativeNotificationData(request)
  const root = record(data)
  const alert = record(root?.orca) ?? root
  if (
    request.content.categoryIdentifier !== MOBILE_PUSH_PROMPT_CATEGORY &&
    alert?.category !== MOBILE_PUSH_PROMPT_CATEGORY
  ) {
    return false
  }

  const payload = readOrcaPushPayload(data)
  let promptData = alert?.prompt
  if (typeof promptData === 'string') {
    promptData = JSON.parse(promptData)
  }
  const prompt = record(promptData)
  const promptId = prompt?.promptId
  if (
    !payload ||
    payload.kind === 'dismiss' ||
    typeof promptId !== 'string' ||
    !Array.isArray(prompt?.options)
  ) {
    return false
  }
  const options: unknown[] = prompt.options
  const optionId = options.map(record).find((option) => option?.role === role)?.optionId
  if (typeof optionId !== 'string' || !optionId) {
    return false
  }

  const hosts = await loadHosts()
  const hostId = resolveHostIdForFingerprint(payload.hostFingerprint, hosts)
  const host = hosts.find((candidate) => candidate.id === hostId)
  const executionHost = parseExecutionHostId(payload.executionHost)
  if (!host || (payload.executionHost && !executionHost)) {
    return false
  }
  const pairedClient = openHostLogicalClient(host, () => {})
  const client =
    executionHost?.kind === 'runtime'
      ? scopeRpcClientToExecutionHost(pairedClient, executionHost.id)
      : pairedClient
  try {
    const pending = agentPromptListPending.interpret(
      await agentPromptListPending.request(
        client,
        {},
        { timeoutMs: 5_000, budgetSpansConnect: true }
      )
    )
    const live = pending?.prompts.find((candidate) => candidate.promptId === promptId)
    if (
      live?.kind !== 'permission' ||
      (payload.worktreeId && live.worktreeId !== payload.worktreeId) ||
      !live.options.some((option) => option.optionId === optionId && option.role === role)
    ) {
      return false
    }
    const digest = sha256(
      new TextEncoder().encode(
        JSON.stringify([payload.hostFingerprint, request.identifier, promptId, optionId])
      )
    )
    const clientOperationId =
      'watch-prompt-' + Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
    const result = agentPromptRespond.interpret(
      await agentPromptRespond.request(
        client,
        {
          promptId,
          optionId,
          clientOperationId
        },
        { timeoutMs: 17_000, budgetSpansConnect: true }
      )
    )
    return result?.ok === true
  } finally {
    pairedClient.close()
  }
}

export function dispatchWatchPromptResponse(response: Notifications.NotificationResponse): void {
  void respondToWatchPrompt(response).catch(() => {})
}
