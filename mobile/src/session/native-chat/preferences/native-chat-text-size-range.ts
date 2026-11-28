export const NATIVE_CHAT_TEXT_SIZE_MIN = 7
export const NATIVE_CHAT_TEXT_SIZE_MAX = 24

export function boundNativeChatTextSize(size: number): number {
  return Math.min(NATIVE_CHAT_TEXT_SIZE_MAX, Math.max(NATIVE_CHAT_TEXT_SIZE_MIN, size))
}
