import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { NATIVE_CHAT_SOURCE_PRIORITY } from './mobile-native-chat-blocks'

// Why: the host streams the whole transcript on the first drain and only
// appended turns afterwards, and the offset-0 re-read can re-emit a turn that
// was already in the snapshot. So mobile merges batches by message id rather
// than concatenating — re-emitted ids replace in place (no dup, no drop),
// preserving first-seen order so the list stays stable as turns stream in.

/** Merge a batch of incoming messages into the existing ordered list, deduping
 *  by `id`. An incoming message replaces an existing one of the same id only
 *  when its source is at least as authoritative (transcript > hook > scrape),
 *  mirroring the desktop assembler's precedence. New ids append in arrival
 *  order. Returns a new array; never mutates the input. */
export function mergeNativeChatMessages(
  existing: readonly NativeChatMessage[],
  incoming: readonly NativeChatMessage[]
): NativeChatMessage[] {
  if (incoming.length === 0) {
    return existing as NativeChatMessage[]
  }
  const merged = [...existing]
  const indexById = new Map<string, number>()
  merged.forEach((message, index) => indexById.set(message.id, index))

  for (const message of incoming) {
    const at = indexById.get(message.id)
    if (at === undefined) {
      indexById.set(message.id, merged.length)
      merged.push(message)
      continue
    }
    const current = merged[at]!
    if (
      NATIVE_CHAT_SOURCE_PRIORITY[message.source] >= NATIVE_CHAT_SOURCE_PRIORITY[current.source]
    ) {
      merged[at] = message
    }
  }
  return merged
}
