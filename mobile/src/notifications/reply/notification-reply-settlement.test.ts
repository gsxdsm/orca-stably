import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseAgentSessionOperationTimestamp } from '../../../../src/shared/agent-session/lifecycle/operations/agent-session-host-authority'
import { NOTIFICATION_REPLY_ACTION } from '../../../../src/shared/notifications/notification-reply'
import { deriveHostFingerprint } from '../payload-identity/push-host-fingerprint'

const sendRequestMock = vi.hoisted(() => vi.fn())
const closeMock = vi.hoisted(() => vi.fn())
const dismissNotificationMock = vi.hoisted(() => vi.fn(async () => {}))
const scheduleNotificationMock = vi.hoisted(() => vi.fn(async () => 'failure-id'))
const records = vi.hoisted(() => new Map<string, string>())

const HOST_PUBLIC_KEY_B64 = btoa('0123456789abcdef0123456789abcdef')
const HOST_FINGERPRINT = deriveHostFingerprint(HOST_PUBLIC_KEY_B64)!

vi.mock('react-native', () => ({
  Platform: { OS: 'android' }
}))

vi.mock('expo-notifications', () => ({
  dismissNotificationAsync: dismissNotificationMock,
  scheduleNotificationAsync: scheduleNotificationMock
}))

vi.mock('../../device-store/device-store', () => ({
  processDeviceStore: () => ({ open: async () => 'ready' })
}))

vi.mock('../../host-catalog/host-store', () => ({
  loadHosts: async () => [
    {
      id: 'host-1',
      label: 'Test Host',
      endpoint: 'ws://127.0.0.1:6769',
      publicKeyB64: HOST_PUBLIC_KEY_B64
    }
  ]
}))

vi.mock('../../transport/connection/host-logical-client', () => ({
  openHostLogicalClient: () => ({
    sendRequest: sendRequestMock,
    close: closeMock
  })
}))

vi.mock('./notification-reply-record-store', () => ({
  notificationReplyRecords: {
    getItem: async (key: string) => records.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      records.set(key, value)
    },
    getAllKeys: async () => [...records.keys()],
    removeItem: async (key: string) => {
      records.delete(key)
    }
  }
}))

vi.mock('./notification-reply-native', () => ({
  completeNativeReply: async () => {},
  pendingNativeReplies: async () => []
}))

const CHAT_PUSH_DATA = {
  hostFingerprint: HOST_FINGERPRINT,
  worktreeId: 'wt-1',
  paneKey: 'tab-1:leaf-1',
  notificationEpoch: 1,
  notificationSeq: 7,
  replyTarget: {
    type: 'chat',
    sessionId: 'session-1'
  }
}

function makeReplyResponse(identifier: string, userText: string) {
  return {
    actionIdentifier: NOTIFICATION_REPLY_ACTION,
    userText,
    notification: {
      date: Date.now(),
      request: {
        identifier,
        content: {
          title: 'Claude finished',
          body: 'Done',
          data: CHAT_PUSH_DATA
        },
        trigger: null
      }
    }
  } as never
}

beforeEach(() => {
  records.clear()
  sendRequestMock.mockReset()
  closeMock.mockReset()
  dismissNotificationMock.mockClear()
  scheduleNotificationMock.mockClear()
})

describe('notification reply chat operation id and Android settlement', () => {
  it('uses a host-valid timestamped clientOperationId for structured chat replies', async () => {
    const sentEnvelopes: Array<{ clientOperationId?: string }> = []
    sendRequestMock.mockImplementation(async (method: string, params: Record<string, unknown>) => {
      if (method === 'agentSession.history') {
        return { ok: true, result: { page: { fence: 3 } } }
      }
      if (method === 'agentSession.send') {
        const envelope = params.envelope as { clientOperationId?: string }
        sentEnvelopes.push(envelope)
        return {
          ok: true,
          result: {
            ok: true,
            value: {
              clientMessageId: envelope.clientOperationId,
              submission: { dispatchState: 'accepted' }
            }
          }
        }
      }
      throw new Error(`Unexpected RPC: ${method}`)
    })

    const { sendNotificationReply } = await import('./notification-reply-delivery')
    await sendNotificationReply(CHAT_PUSH_DATA, 'ship it', 'notification-reply-deadbeef')

    expect(sentEnvelopes).toHaveLength(1)
    const opId = sentEnvelopes[0]?.clientOperationId ?? ''
    expect(parseAgentSessionOperationTimestamp(opId)).not.toBeNull()
    expect(closeMock).toHaveBeenCalledTimes(1)
  })

  it('dismisses the original notification when delivery fails or repeats so RemoteInput stops spinning', async () => {
    sendRequestMock.mockResolvedValue({
      ok: false,
      error: { code: 'agent_session_operation_invalid', message: 'invalid' }
    })

    const { handleNotificationReply } = await import('./notification-reply-response')
    const response = makeReplyResponse('notif-tag-1', 'hello from fold')

    await expect(handleNotificationReply(response)).resolves.toBe(true)
    expect(scheduleNotificationMock).toHaveBeenCalledTimes(1)
    expect(dismissNotificationMock).toHaveBeenCalledWith('notif-tag-1')

    dismissNotificationMock.mockClear()
    await expect(handleNotificationReply(response)).resolves.toBe(true)
    expect(dismissNotificationMock).toHaveBeenCalledWith('notif-tag-1')
  })
})
