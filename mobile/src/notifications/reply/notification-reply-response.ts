import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { NOTIFICATION_REPLY_ACTION } from '../../../../src/shared/notifications/notification-reply'
import { sha256 } from '../../../../src/shared/hashing/sha256'
import { parsePaneKey } from '../../../../src/shared/workspace-layout/stable-pane-id'
import { editMobileNativeChatDraft } from '../../session/native-chat/composer/drafts/mobile-native-chat-draft-store'
import { resolveHostIdForFingerprint } from '../payload-identity/push-host-fingerprint'
import { readOrcaPushPayload } from '../payload-identity/push-payload'
import { readNativeNotificationData } from '../payload-identity/native-notification-data'
import { loadHosts } from '../../host-catalog/host-store'
import { sendNotificationReply } from './notification-reply-delivery'
import { completeNativeReply } from './notification-reply-native'
import { translate } from '../../i18n/mobile-i18n'
import { loadMobileNativeChatDrafts } from '../../session/native-chat/composer/drafts/mobile-native-chat-draft-persistence'

const PREFIX = 'orca:notificationReply:'
const active = new Map<string, Promise<boolean>>()

export async function restoreNotificationReplyDraft(data: unknown): Promise<void> {
  if (
    !data ||
    typeof data !== 'object' ||
    !('replyDraftId' in data) ||
    typeof data.replyDraftId !== 'string'
  ) {
    return
  }
  const raw = await AsyncStorage.getItem(PREFIX + data.replyDraftId)
  if (!raw) {
    return
  }
  const saved: unknown = JSON.parse(raw)
  if (
    !saved ||
    typeof saved !== 'object' ||
    !('text' in saved) ||
    typeof saved.text !== 'string' ||
    ('restored' in saved && saved.restored === true)
  ) {
    return
  }
  const payload = readOrcaPushPayload(data)
  const pane = payload?.paneKey ? parsePaneKey(payload.paneKey) : null
  const hostId = payload
    ? resolveHostIdForFingerprint(payload.hostFingerprint, await loadHosts())
    : null
  if (!hostId || !payload?.worktreeId || !pane) {
    return
  }
  const text = saved.text
  await loadMobileNativeChatDrafts(hostId, payload.worktreeId)
  editMobileNativeChatDraft(`${hostId}\0${payload.worktreeId}\0${pane.tabId}`, (current) =>
    current ? `${current}\n${text}` : text
  )
  await AsyncStorage.setItem(
    PREFIX + data.replyDraftId,
    JSON.stringify({ ...saved, restored: true })
  )
}

export function handleNotificationReply(
  response: Notifications.NotificationResponse
): Promise<boolean> {
  if (response.actionIdentifier !== NOTIFICATION_REPLY_ACTION) {
    return Promise.resolve(false)
  }
  const text =
    'userText' in response && typeof response.userText === 'string' ? response.userText : ''
  const data = readNativeNotificationData(response.notification.request)
  const payload = readOrcaPushPayload(data)
  const id = Array.from(
    sha256(
      new TextEncoder().encode(
        JSON.stringify([payload?.hostFingerprint, response.notification.request.identifier, text])
      )
    ),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('')
  const pending = active.get(id)
  if (pending) {
    return pending
  }
  const result = deliver(response, data, text, id).finally(async () => {
    active.delete(id)
    await completeNativeReply(response.notification.request.identifier)
  })
  active.set(id, result)
  return result
}

async function deliver(
  response: Notifications.NotificationResponse,
  data: unknown,
  text: string,
  id: string
): Promise<boolean> {
  const key = PREFIX + id
  // A duplicate delivery after process death must never submit the terminal text twice.
  if (await AsyncStorage.getItem(key)) {
    return true
  }
  await AsyncStorage.setItem(key, JSON.stringify({ text, state: 'sending', data }))
  try {
    await sendNotificationReply(data, text, `notification-reply-${id}`)
    await AsyncStorage.setItem(key, JSON.stringify({ state: 'sent' }))
    await Notifications.dismissNotificationAsync(response.notification.request.identifier)
  } catch (error) {
    await AsyncStorage.setItem(key, JSON.stringify({ text, state: 'failed', data }))
    const payload = readOrcaPushPayload(data)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: translate('notifications.reply.failed', 'Reply not sent'),
        body: translate('notifications.reply.failedReason', 'Reply not sent: {{reason}}', {
          reason: error instanceof Error ? error.message : 'Host unreachable'
        }),
        data: { ...payload, replyDraftId: id },
        sound: 'default'
      },
      trigger: null
    })
  }
  return true
}
