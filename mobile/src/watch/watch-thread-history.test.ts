import { describe, expect, it } from 'vitest'
import { boundWatchThreadPage } from './watch-thread-history'

describe('watch thread pages', () => {
  it('keeps every cursor row while fitting escaped, multibyte text in a WatchConnectivity reply', () => {
    const messages = Array.from({ length: 8 }, (_, index) => ({
      id: `message-${index}`,
      role: 'agent' as const,
      text: '\u0001😀'.repeat(600),
      at: index
    }))
    const before = '{"epoch":"journal","sequence":8}'
    const page = boundWatchThreadPage({ before, messages })
    expect(page?.before).toBe(before)
    expect(page?.messages.map(({ id }) => id)).toEqual(messages.map(({ id }) => id))
    expect(
      page?.messages.every((message) => message.shortened && !message.text.endsWith('\ud83d'))
    ).toBe(true)
    expect(new TextEncoder().encode(JSON.stringify(page)).byteLength).toBeLessThan(24_576)
  })
})
