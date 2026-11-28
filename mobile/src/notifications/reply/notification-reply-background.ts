import * as TaskManager from 'expo-task-manager'
import * as Notifications from 'expo-notifications'
import { handleNotificationReply } from './notification-reply-response'
import { ensureNotificationReplyCategory } from './notification-reply-category'
import { pendingNativeReplies } from './notification-reply-native'
import { subscribeMobileUiLanguage } from '../../i18n/mobile-i18n'

const TASK_NAME = 'orca-notification-reply'
TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  TASK_NAME,
  async ({ data, error }) => {
    if (!error && data && 'actionIdentifier' in data) {
      await handleNotificationReply(data)
    }
  }
)

// Register at entry: a notification response may launch JS without mounting a route.
Notifications.addNotificationResponseReceivedListener((response) => {
  void handleNotificationReply(response).catch(() => {})
})
subscribeMobileUiLanguage(() => {
  void ensureNotificationReplyCategory().catch(() => {})
})

export async function registerNotificationReplyTask(): Promise<void> {
  await ensureNotificationReplyCategory()
  for (const response of await pendingNativeReplies()) {
    await handleNotificationReply(response)
  }
  if (await TaskManager.isAvailableAsync()) {
    await Notifications.registerTaskAsync(TASK_NAME)
  }
}
