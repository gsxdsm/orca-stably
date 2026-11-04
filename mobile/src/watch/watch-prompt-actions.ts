import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { translate } from '../i18n/mobile-i18n'

export const WATCH_PROMPT_CATEGORY = 'orca.prompt'

const APPROVE_ACTION = 'approve'
const DENY_ACTION = 'deny'
const REPLY_ACTION = 'reply'

export type WatchPromptResponseInput = {
  actionIdentifier: string
  userText?: string
  notification: {
    request: {
      identifier: string
      content: {
        categoryIdentifier?: string | null
        data?: unknown
      }
    }
  }
}

export type WatchPromptAction =
  | { type: 'respond'; hostId: string; promptId: string; optionId: string }
  | { type: 'reply'; hostId: string; sessionKey: string; text: string }

type PromptOption = { optionId: string; role: 'approve' | 'approve-always' | 'deny' | 'other' }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function payload(data: unknown): Record<string, unknown> {
  const root = record(data) ?? {}
  const orca = record(root.orca) ?? {}
  return { ...orca, ...root }
}

function categoryOf(input: WatchPromptResponseInput): string | null {
  if (input.notification.request.content.categoryIdentifier === WATCH_PROMPT_CATEGORY) {
    return WATCH_PROMPT_CATEGORY
  }
  return payload(input.notification.request.content.data).category === WATCH_PROMPT_CATEGORY
    ? WATCH_PROMPT_CATEGORY
    : null
}

function optionsOf(data: unknown): PromptOption[] {
  const prompt = record(payload(data).prompt)
  if (!prompt || !Array.isArray(prompt.options)) {
    return []
  }
  const options: PromptOption[] = []
  for (const option of prompt.options) {
    const row = record(option)
    const optionId = text(row?.optionId)
    const role = row?.role
    if (
      optionId &&
      (role === 'approve' || role === 'approve-always' || role === 'deny' || role === 'other')
    ) {
      options.push({ optionId, role })
    }
  }
  return options
}

export function isWatchPromptResponse(input: WatchPromptResponseInput): boolean {
  return (
    input.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
    categoryOf(input) === WATCH_PROMPT_CATEGORY
  )
}

export function readWatchPromptAction(input: WatchPromptResponseInput): WatchPromptAction | null {
  if (!isWatchPromptResponse(input)) {
    return null
  }
  const data = payload(input.notification.request.content.data)
  const hostId = text(data.hostId)
  const prompt = record(data.prompt)
  const promptId = text(prompt?.promptId)
  const options = optionsOf(input.notification.request.content.data)
  const sessionKey =
    text(data.sessionKey) ??
    (hostId && text(data.paneKey) ? `${hostId}|term|${text(data.paneKey)}` : null)
  const matched = options.find((option) => option.optionId === input.actionIdentifier)
  if (matched && hostId && promptId) {
    return { type: 'respond', hostId, promptId, optionId: matched.optionId }
  }
  if (input.actionIdentifier === APPROVE_ACTION || input.actionIdentifier === DENY_ACTION) {
    const role = input.actionIdentifier === APPROVE_ACTION ? 'approve' : 'deny'
    const option =
      options.find((item) => item.role === role) ??
      (role === 'approve' ? options.find((item) => item.role === 'approve-always') : undefined)
    if (hostId && promptId && option) {
      return { type: 'respond', hostId, promptId, optionId: option.optionId }
    }
    return null
  }
  const reply = input.userText?.trim()
  if (input.actionIdentifier === REPLY_ACTION && hostId && sessionKey && reply) {
    return { type: 'reply', hostId, sessionKey, text: reply.slice(0, 2000) }
  }
  return null
}

let handler: ((response: WatchPromptResponseInput) => void) | null = null
let queued: WatchPromptResponseInput | null = null

export function setWatchPromptResponseHandler(
  next: ((response: WatchPromptResponseInput) => void) | null
): () => void {
  handler = next
  if (next && queued) {
    const pending = queued
    queued = null
    next(pending)
  }
  return () => {
    if (handler === next) {
      handler = null
    }
  }
}

export function dispatchWatchPromptResponse(input: WatchPromptResponseInput): boolean {
  if (!isWatchPromptResponse(input)) {
    return false
  }
  if (handler) {
    handler(input)
  } else {
    queued = input
  }
  return true
}

export async function ensureWatchPromptCategory(): Promise<void> {
  if (Platform.OS === 'web') {
    return
  }
  await Notifications.setNotificationCategoryAsync(WATCH_PROMPT_CATEGORY, [
    {
      identifier: APPROVE_ACTION,
      buttonTitle: translate('notifications.watchPrompt.approve', 'Approve'),
      options: { opensAppToForeground: true }
    },
    {
      identifier: DENY_ACTION,
      buttonTitle: translate('notifications.watchPrompt.deny', 'Deny'),
      options: { isDestructive: true, opensAppToForeground: true }
    },
    {
      identifier: REPLY_ACTION,
      buttonTitle: translate('notifications.watchPrompt.reply', 'Reply'),
      textInput: {
        submitButtonTitle: translate('notifications.watchPrompt.send', 'Send'),
        placeholder: translate('notifications.watchPrompt.placeholder', 'Message')
      },
      options: { opensAppToForeground: true }
    }
  ])
}
