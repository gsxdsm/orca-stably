import type { NativeChatDiffReveal } from '../../../../shared/native-chat/tools/native-chat-turn-diffs'

export type NativeChatMessageListNavigation =
  | { kind: 'diff'; target: NativeChatDiffReveal }
  | { kind: 'rail'; messageId: string; requestId: number }
