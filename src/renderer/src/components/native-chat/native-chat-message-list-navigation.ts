import type { NativeChatDiffReveal } from './native-chat-turn-diffs'

export type NativeChatMessageListNavigation =
  | { kind: 'diff'; target: NativeChatDiffReveal }
  | { kind: 'rail'; messageId: string; requestId: number }
