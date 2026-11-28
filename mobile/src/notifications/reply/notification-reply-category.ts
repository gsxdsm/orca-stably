import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { MOBILE_PUSH_PROMPT_CATEGORY } from '../../../../src/shared/notifications/mobile-push-contract'
import {
  NOTIFICATION_REPLY_ACTION,
  NOTIFICATION_REPLY_CATEGORY
} from '../../../../src/shared/notifications/notification-reply'
import { translate } from '../../i18n/mobile-i18n'
import { watchPromptNotificationActions } from '../../watch/watch-prompt-category'

let pendingRegistration = Promise.resolve()

export function ensureNotificationReplyCategory(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return Promise.resolve()
  }
  const includeReply =
    Platform.OS === 'ios' || (Platform.OS === 'android' && Platform.Version >= 24)
  const registration = pendingRegistration.then(async () => {
    const actions = watchPromptNotificationActions()
    if (includeReply) {
      const reply: Notifications.NotificationAction = {
        identifier: NOTIFICATION_REPLY_ACTION,
        buttonTitle: translate('notifications.reply.action', 'Reply'),
        textInput: {
          submitButtonTitle: translate('notifications.reply.send', 'Send'),
          placeholder: translate('notifications.reply.placeholder', 'Message')
        },
        options: { opensAppToForeground: false }
      }
      await Notifications.setNotificationCategoryAsync(NOTIFICATION_REPLY_CATEGORY, [reply])
      actions.push(reply)
    }
    await Notifications.setNotificationCategoryAsync(MOBILE_PUSH_PROMPT_CATEGORY, actions)
  })
  pendingRegistration = registration.catch(() => {})
  return registration
}
