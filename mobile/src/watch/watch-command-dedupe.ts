import type { WatchReply } from './watch-contract'

export const WATCH_COMMAND_DEDUPE_TTL_MS = 5 * 60 * 1000
export const WATCH_COMMAND_DEDUPE_MAX = 200

type Slot = {
  at: number
  reply?: WatchReply
  pending?: Promise<WatchReply>
}

// A repeated command id returns the reply the phone already produced. phone_unavailable is not a
// result: the watch retries that same id after the cold wake, and terminal.send must not run twice.
export function createWatchCommandDedupe(now: () => number = Date.now) {
  const slots = new Map<string, Slot>()

  function prune(time: number) {
    for (const [id, slot] of slots) {
      if (!slot.pending && time - slot.at >= WATCH_COMMAND_DEDUPE_TTL_MS) {
        slots.delete(id)
      }
    }
    while (slots.size > WATCH_COMMAND_DEDUPE_MAX) {
      const oldest = slots.keys().next().value
      if (oldest === undefined) {
        break
      }
      if (slots.get(oldest)?.pending) {
        break
      }
      slots.delete(oldest)
    }
  }

  return {
    run(id: string, execute: () => Promise<WatchReply>): Promise<WatchReply> {
      const time = now()
      prune(time)
      const existing = slots.get(id)
      if (existing?.reply) {
        return Promise.resolve(existing.reply)
      }
      if (existing?.pending) {
        return existing.pending
      }
      const slot: Slot = { at: time }
      const pending = Promise.resolve()
        .then(execute)
        .then(
          (reply) => {
            slot.pending = undefined
            if (!reply.ok && reply.reason === 'phone_unavailable') {
              slots.delete(id)
              return reply
            }
            slot.reply = reply
            slot.at = now()
            return reply
          },
          (error: unknown) => {
            slots.delete(id)
            throw error
          }
        )
      slot.pending = pending
      slots.set(id, slot)
      return pending
    }
  }
}
