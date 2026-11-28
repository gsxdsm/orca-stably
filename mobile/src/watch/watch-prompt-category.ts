import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { MOBILE_PUSH_PROMPT_CATEGORY } from '../../../src/shared/notifications/mobile-push-contract'
import { translate } from '../i18n/mobile-i18n'

export const APPROVE_WATCH_PROMPT_ACTION = 'approve'
export const DENY_WATCH_PROMPT_ACTION = 'deny'

export function watchPromptNotificationActions(): Notifications.NotificationAction[] {
  return [
    {
      identifier: APPROVE_WATCH_PROMPT_ACTION,
      buttonTitle: translate('notifications.watchPrompt.approve', 'Allow once'),
      options: { opensAppToForeground: true }
    },
    {
      identifier: DENY_WATCH_PROMPT_ACTION,
      buttonTitle: translate('notifications.watchPrompt.deny', 'Deny'),
      options: { isDestructive: true, opensAppToForeground: true }
    }
  ]
}

export async function ensureWatchPromptCategory(): Promise<void> {
  if (Platform.OS !== 'web') {
    await Notifications.setNotificationCategoryAsync(
      MOBILE_PUSH_PROMPT_CATEGORY,
      watchPromptNotificationActions()
    )
  }
}
