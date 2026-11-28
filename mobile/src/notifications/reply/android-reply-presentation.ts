import type * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

export async function showAndroidReplySent(
  response: Notifications.NotificationResponse
): Promise<void> {
  if (Platform.OS !== 'android') {
    return
  }
  const { identifier } = response.notification.request
  const presentation = requireOptionalNativeModule<{
    showReplySent(identifier: string, text: string): Promise<void>
  }>('OrcaNotificationReplyPresentation')
  const text =
    'userText' in response && typeof response.userText === 'string' ? response.userText : ''
  await presentation?.showReplySent(identifier, text)
}
