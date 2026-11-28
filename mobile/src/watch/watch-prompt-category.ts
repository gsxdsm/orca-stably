import type * as Notifications from 'expo-notifications'
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
