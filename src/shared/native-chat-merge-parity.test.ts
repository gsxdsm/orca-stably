import { describe, expect, it } from 'vitest'
import { NATIVE_CHAT_SOURCE_PRIORITY, type NativeChatMessage } from './native-chat-types'
import {
  applyAppend as sharedApplyAppend,
  boundNativeChatWindow as sharedBound,
  createNativeChatMerger as createSharedMerger,
  mergeNativeChatMessagesWith,
  replaceList as sharedReplace
} from './native-chat-merge'
import {
  applyAppend as mobileApplyAppend,
  boundNativeChatWindow as mobileBound,
  createNativeChatMerger as createMobileMerger,
  mergeNativeChatMessages,
  replaceList as mobileReplace
} from '../../mobile/src/session/mobile-native-chat-merge'

// Cross-surface PARITY TEST: the desktop live path uses the shared merge
// (src/shared/native-chat-merge.ts), mobile uses a parity-locked twin
// (mobile/src/session/mobile-native-chat-merge.ts). Metro can't import the
// shared runtime body, so the two algorithms are duplicated — this test feeds an
// identical read+subscribe script to both and asserts byte-identical output,
// catching any drift between the surfaces (#6).

function msg(
  overrides: Partial<NativeChatMessage> & Pick<NativeChatMessage, 'id'>
): NativeChatMessage {
  return {
    role: 'assistant',
    blocks: [{ type: 'text', text: overrides.id }],
    timestamp: 0,
    source: 'transcript',
    ...overrides
  }
}

// A read (the windowed base) followed by a sequence of subscribe batches, the
// same shape both surfaces receive over the RPC bridge.
const read: NativeChatMessage[] = [msg({ id: 'a' }), msg({ id: 'b', source: 'hook' })]
const subscribeBatches: NativeChatMessage[][] = [
  [msg({ id: 'c' })],
  [], // empty frame
  [msg({ id: 'b', source: 'transcript', blocks: [{ type: 'text', text: 'final' }] })], // supersede
  [msg({ id: 'b', source: 'scrape', blocks: [{ type: 'text', text: 'noop' }] })], // lower prio, ignored
  [msg({ id: 'a' })], // re-emit existing id, no change
  [msg({ id: 'd' }), msg({ id: 'e' })]
]

describe('native-chat merge parity (desktop ↔ mobile)', () => {
  it('pure merge: identical final list for the same read+subscribe script', () => {
    let shared = mergeNativeChatMessagesWith(read, [], NATIVE_CHAT_SOURCE_PRIORITY)
    let mobile = mergeNativeChatMessages(read, [])
    expect(shared).toEqual(mobile)
    for (const batch of subscribeBatches) {
      shared = mergeNativeChatMessagesWith(shared, batch, NATIVE_CHAT_SOURCE_PRIORITY)
      mobile = mergeNativeChatMessages(mobile, batch)
      expect(shared).toEqual(mobile)
    }
  })

  it('stateful merger: identical output to the pure merge, both surfaces agree', () => {
    const sharedMerger = createSharedMerger(NATIVE_CHAT_SOURCE_PRIORITY)
    const mobileMerger = createMobileMerger()
    sharedReplace(sharedMerger, read)
    mobileReplace(mobileMerger, read)

    let pure = mergeNativeChatMessagesWith(read, [], NATIVE_CHAT_SOURCE_PRIORITY)
    for (const batch of subscribeBatches) {
      const sharedOut = sharedApplyAppend(sharedMerger, batch)
      const mobileOut = mobileApplyAppend(mobileMerger, batch)
      pure = mergeNativeChatMessagesWith(pure, batch, NATIVE_CHAT_SOURCE_PRIORITY)
      expect(sharedOut).toEqual(mobileOut)
      expect(sharedOut).toEqual(pure)
    }
  })

  it('window bound: both surfaces trim to the same recent tail', () => {
    const long = Array.from({ length: 10 }, (_, i) => msg({ id: `m${i}` }))
    expect(sharedBound(long, 4)).toEqual(mobileBound(long, 4))
    expect(sharedBound(long, 4).map((m) => m.id)).toEqual(['m6', 'm7', 'm8', 'm9'])
    expect(sharedBound(long, 0)).toBe(long)
    expect(mobileBound(long, 0)).toBe(long)
  })
})
