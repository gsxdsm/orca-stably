import { appendFile, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import { getActiveNativeChatWatcherCount, subscribeNativeChatTranscript } from './transcript-watch'

let tempRoots: string[] = []

beforeEach(() => {
  tempRoots = []
})

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

async function tempFile(initial: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-native-chat-watch-'))
  tempRoots.push(root)
  const filePath = join(root, 'rollout.jsonl')
  await writeFile(filePath, initial)
  return filePath
}

function claudeLine(uuid: string, role: 'user' | 'assistant', text: string): string {
  return `${JSON.stringify({
    type: role,
    uuid,
    timestamp: '2026-06-01T10:00:00.000Z',
    message: { role, content: role === 'user' ? text : [{ type: 'text', text }] }
  })}\n`
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('subscribeNativeChatTranscript', () => {
  it('emits only the newly-appended messages on append', async () => {
    const filePath = await tempFile(claudeLine('u-1', 'user', 'first'))
    const batches: NativeChatMessage[][] = []

    const sub = await subscribeNativeChatTranscript({
      agent: 'claude',
      sessionId: 'ignored',
      filePath,
      onAppend: (messages) => batches.push(messages),
      debounceMs: 5
    })

    await appendFile(filePath, claudeLine('a-1', 'assistant', 'reply'))
    await waitFor(() => batches.flat().length >= 1)

    sub.unsubscribe()

    // The pre-existing 'first' line must NOT be re-emitted — only the append.
    const emitted = batches.flat()
    expect(emitted).toHaveLength(1)
    expect(emitted[0].id).toBe('a-1')
    expect(emitted[0].role).toBe('assistant')
  })

  it('releases the watcher on unsubscribe (no leak)', async () => {
    const filePath = await tempFile(claudeLine('u-1', 'user', 'hi'))
    const before = getActiveNativeChatWatcherCount()

    const sub = await subscribeNativeChatTranscript({
      agent: 'claude',
      sessionId: 'ignored',
      filePath,
      onAppend: () => {},
      debounceMs: 5
    })
    expect(getActiveNativeChatWatcherCount()).toBe(before + 1)

    sub.unsubscribe()
    expect(getActiveNativeChatWatcherCount()).toBe(before)

    // Idempotent: a second unsubscribe must not under-count.
    sub.unsubscribe()
    expect(getActiveNativeChatWatcherCount()).toBe(before)
  })

  it('coalesces rapid successive appends without dropping messages', async () => {
    const filePath = await tempFile(claudeLine('u-1', 'user', 'hi'))
    const seen: NativeChatMessage[] = []

    const sub = await subscribeNativeChatTranscript({
      agent: 'claude',
      sessionId: 'ignored',
      filePath,
      onAppend: (messages) => seen.push(...messages),
      debounceMs: 10
    })

    // Fire several appends back-to-back within the debounce window.
    await appendFile(filePath, claudeLine('a-1', 'assistant', 'one'))
    await appendFile(filePath, claudeLine('a-2', 'assistant', 'two'))
    await appendFile(filePath, claudeLine('a-3', 'assistant', 'three'))

    await waitFor(() => seen.length >= 3)
    sub.unsubscribe()

    const ids = seen.map((m) => m.id)
    expect(ids).toEqual(['a-1', 'a-2', 'a-3'])
  })

  it('survives file replacement / rotation (offset reset on shrink)', async () => {
    const filePath = await tempFile(
      claudeLine('u-1', 'user', 'old') + claudeLine('a-1', 'assistant', 'old-reply')
    )
    const seen: NativeChatMessage[] = []

    const sub = await subscribeNativeChatTranscript({
      agent: 'claude',
      sessionId: 'ignored',
      filePath,
      onAppend: (messages) => seen.push(...messages),
      debounceMs: 5
    })

    // Replace the file with shorter content (simulates rotation to a new,
    // smaller session file at the same resolved path).
    await writeFile(filePath, claudeLine('u-2', 'user', 'fresh'))
    await waitFor(() => seen.some((m) => m.id === 'u-2'))

    // A subsequent append on the rotated file is still tailed.
    await appendFile(filePath, claudeLine('a-2', 'assistant', 'fresh-reply'))
    await waitFor(() => seen.some((m) => m.id === 'a-2'))

    sub.unsubscribe()
    const ids = seen.map((m) => m.id)
    expect(ids).toContain('u-2')
    expect(ids).toContain('a-2')
  })

  it('returns a no-op unsubscribe when the file cannot be resolved', async () => {
    const before = getActiveNativeChatWatcherCount()
    const sub = await subscribeNativeChatTranscript({
      agent: 'claude',
      sessionId: '',
      onAppend: () => {}
    })
    expect(getActiveNativeChatWatcherCount()).toBe(before)
    // Must not throw.
    sub.unsubscribe()
  })
})
