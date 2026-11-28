import type * as Notifications from 'expo-notifications'
import { describe, expect, it, vi } from 'vitest'
import { registerNotificationReplyTask } from './notification-reply-background'

const native = vi.hoisted(() => ({
  categories: new Map<string, Notifications.NotificationAction[]>(),
  localeListeners: new Set<() => void>(),
  translated: false
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: () => {},
  getNotificationCategoriesAsync: async () =>
    [...native.categories].map(([identifier, actions]) => ({ identifier, actions })),
  setNotificationCategoryAsync: async (
    identifier: string,
    actions: Notifications.NotificationAction[]
  ) => {
    native.categories.set(identifier, actions)
  }
}))
vi.mock('expo-task-manager', () => ({ defineTask: () => {}, isAvailableAsync: async () => false }))
vi.mock('./notification-reply-response', () => ({
  handleNotificationReply: async () => true,
  recoverInterruptedNotificationReplies: async () => {}
}))
vi.mock('./notification-reply-native', () => ({ pendingNativeReplies: async () => [] }))
vi.mock('../../i18n/mobile-i18n', () => ({
  translate: (_key: string, text: string) => (native.translated ? `Translated ${text}` : text),
  subscribeMobileUiLanguage: (listener: () => void) => {
    native.localeListeners.add(listener)
    return () => native.localeListeners.delete(listener)
  }
}))

describe('notification categories registered by the app entry', () => {
  it('keeps permission actions and the shared background reply through a locale refresh', async () => {
    native.categories.set('orca.prompt', [
      { identifier: 'reply', buttonTitle: 'Legacy reply', options: { opensAppToForeground: true } }
    ])
    await registerNotificationReplyTask()
    expect(native.categories.get('orca.prompt')?.map((action) => action.identifier)).toEqual([
      'approve',
      'deny',
      'orca.reply.send'
    ])
    expect(native.categories.get('orca.reply')).toEqual([
      {
        identifier: 'orca.reply.send',
        buttonTitle: 'Reply',
        textInput: { submitButtonTitle: 'Send', placeholder: 'Message' },
        options: { opensAppToForeground: false }
      }
    ])

    native.translated = true
    for (const listener of native.localeListeners) {
      listener()
    }
    await vi.waitFor(() => {
      expect(native.categories.get('orca.prompt')).toEqual([
        {
          identifier: 'approve',
          buttonTitle: 'Translated Allow once',
          options: { opensAppToForeground: true }
        },
        {
          identifier: 'deny',
          buttonTitle: 'Translated Deny',
          options: { isDestructive: true, opensAppToForeground: true }
        },
        {
          identifier: 'orca.reply.send',
          buttonTitle: 'Translated Reply',
          textInput: { submitButtonTitle: 'Translated Send', placeholder: 'Translated Message' },
          options: { opensAppToForeground: false }
        }
      ])
      expect(native.categories.get('orca.reply')).toEqual([
        native.categories.get('orca.prompt')?.[2]
      ])
    })
  })
})
