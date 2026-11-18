import { beforeEach, describe, expect, it } from 'vitest'
import {
  NATIVE_CHAT_TEXT_SCALE_STORAGE_KEY,
  NEGOTIATED_PAGE_STORAGE_KEYS,
  PAGE_STORAGE_EXACT_KEYS,
  PAGE_STORAGE_MAX_VALUE_CHARS
} from '../../page-storage/page-storage-keys'
import pageAsyncStorage, {
  PageStorageRefusedError,
  publishPageStorage,
  refreshPageTerminalShortcuts
} from './page-async-storage'

type Write = { key: string; value: string | null }

const writes: Write[] = []
let granted = true

const HOST_ID = 'host-1'
const SESSION_ROUTE = '/h/host-1/session/wt-1'

function publish(entries: Record<string, string> = {}): void {
  writes.length = 0
  publishPageStorage(
    entries,
    (key, value) => {
      if (!granted) {
        return false
      }
      writes.push({ key, value })
      return true
    },
    HOST_ID,
    SESSION_ROUTE
  )
}

async function refusalOf(write: Promise<void>): Promise<PageStorageRefusedError> {
  try {
    await write
  } catch (error) {
    if (error instanceof PageStorageRefusedError) {
      return error
    }
    throw error
  }
  throw new Error('the write was not refused')
}

beforeEach(() => {
  granted = true
  publish()
})

describe('Chat UI on a session page', () => {
  const CHAT_UI = 'orca:defaultSessionView'

  it('keeps a primed chat when a refresh omits the key', async () => {
    publish({ [CHAT_UI]: 'chat', 'orca:terminal-accessory-layout': 'row' })
    refreshPageTerminalShortcuts({}, [])
    await expect(pageAsyncStorage.getItem(CHAT_UI)).resolves.toBe('chat')
    await expect(pageAsyncStorage.getItem('orca:terminal-accessory-layout')).resolves.toBeNull()
  })

  it('replaces that chat when the refresh names terminal', async () => {
    publish({ [CHAT_UI]: 'chat' })
    refreshPageTerminalShortcuts({ [CHAT_UI]: 'terminal' }, [])
    await expect(pageAsyncStorage.getItem(CHAT_UI)).resolves.toBe('terminal')
  })

  it('asks the shell when init omitted Chat UI, and keeps the answer', async () => {
    const reads: string[] = []
    publishPageStorage(
      {},
      () => true,
      HOST_ID,
      SESSION_ROUTE,
      [],
      null,
      async (key) => {
        reads.push(key)
        return key === CHAT_UI ? 'chat' : null
      }
    )
    await expect(pageAsyncStorage.getItem(CHAT_UI)).resolves.toBe('chat')
    await expect(pageAsyncStorage.getItem(CHAT_UI)).resolves.toBe('chat')
    expect(reads).toEqual([CHAT_UI])
  })

  it('stays unset when the shell refuses the read', async () => {
    publishPageStorage(
      {},
      () => true,
      HOST_ID,
      SESSION_ROUTE,
      [],
      null,
      async () => {
        throw new Error('this page may not read that key')
      }
    )
    await expect(pageAsyncStorage.getItem(CHAT_UI)).resolves.toBeNull()
  })
})

describe('what init primed', () => {
  it('answers a read without waiting on the shell', async () => {
    publish({ 'orca:pins:host-1': '["wt-1"]' })
    // Read synchronously from the cache behind the async API; a round trip would change first-render/golden timing.
    await expect(pageAsyncStorage.getItem('orca:pins:host-1')).resolves.toBe('["wt-1"]')
    await expect(pageAsyncStorage.getItem('orca:pins:host-2')).resolves.toBeNull()
  })

  it('replaces what the last page held rather than adding to it', async () => {
    publish({ 'orca:pins:host-1': '["wt-1"]' })
    publish({ 'orca:pins:host-2': '["wt-2"]' })
    await expect(pageAsyncStorage.getItem('orca:pins:host-1')).resolves.toBeNull()
  })
})

describe('a write the page makes', () => {
  it('goes to the app, and is readable here at once', async () => {
    await pageAsyncStorage.setItem('orca:pins:host-1', '["wt-1","wt-2"]')
    expect(writes).toEqual([{ key: 'orca:pins:host-1', value: '["wt-1","wt-2"]' }])
    await expect(pageAsyncStorage.getItem('orca:pins:host-1')).resolves.toBe('["wt-1","wt-2"]')
  })

  it('removes by writing null, which is what the app then deletes', async () => {
    publish({ 'orca:pins:host-1': '["wt-1"]' })
    await pageAsyncStorage.removeItem('orca:pins:host-1')
    expect(writes).toEqual([{ key: 'orca:pins:host-1', value: null }])
    await expect(pageAsyncStorage.getItem('orca:pins:host-1')).resolves.toBeNull()
  })

  it('allowlists the pinched chat text size and round-trips a value', async () => {
    expect(PAGE_STORAGE_EXACT_KEYS).toContain(NATIVE_CHAT_TEXT_SCALE_STORAGE_KEY)
    expect(NEGOTIATED_PAGE_STORAGE_KEYS).toContain(NATIVE_CHAT_TEXT_SCALE_STORAGE_KEY)
    publish({ [NATIVE_CHAT_TEXT_SCALE_STORAGE_KEY]: '1.35' })
    expect(pageAsyncStorage.getItemSync(NATIVE_CHAT_TEXT_SCALE_STORAGE_KEY)).toBe('1.35')
    await pageAsyncStorage.setItem(NATIVE_CHAT_TEXT_SCALE_STORAGE_KEY, '1.5')
    expect(writes).toEqual([{ key: NATIVE_CHAT_TEXT_SCALE_STORAGE_KEY, value: '1.5' }])
    await expect(pageAsyncStorage.getItem(NATIVE_CHAT_TEXT_SCALE_STORAGE_KEY)).resolves.toBe('1.5')
    expect(pageAsyncStorage.getItemSync(NATIVE_CHAT_TEXT_SCALE_STORAGE_KEY)).toBe('1.5')
    refreshPageTerminalShortcuts({}, [])
    expect(pageAsyncStorage.getItemSync(NATIVE_CHAT_TEXT_SCALE_STORAGE_KEY)).toBe('1.5')
  })

  it('is dropped, and not kept, for a key outside the allowlist', async () => {
    // Drop unlisted writes without caching an app-invisible value; preference callers have no catch for a rejection (ruling 33.4).
    await expect(pageAsyncStorage.setItem('orca:hosts', 'true')).resolves.toBeUndefined()
    expect(writes).toEqual([])
    await expect(pageAsyncStorage.getItem('orca:hosts')).resolves.toBeNull()
  })

  it('never empties the app store, which is not this document to empty', async () => {
    publish({ 'orca:pins:host-1': '["wt-1"]' })
    await pageAsyncStorage.clear()
    expect(writes).toEqual([])
    await expect(pageAsyncStorage.getItem('orca:pins:host-1')).resolves.toBe('["wt-1"]')
  })
})

describe('what the page will not keep', () => {
  it("drops another host's pinned list, so a later read cannot answer with it", async () => {
    publish({ 'orca:pins:host-1': '["mine"]' })
    await expect(
      pageAsyncStorage.setItem('orca:pins:host-2', '["theirs"]')
    ).resolves.toBeUndefined()
    // Neither post nor cache a write the shell refuses; otherwise only this page would believe the pin persisted.
    expect(writes).toEqual([])
    expect(await pageAsyncStorage.getItem('orca:pins:host-2')).toBeNull()
  })

  it('refuses a value over the envelope bound rather than caching what the wire will drop', async () => {
    publish()
    const oversized = 'x'.repeat(PAGE_STORAGE_MAX_VALUE_CHARS + 1)
    const refusal = await refusalOf(
      pageAsyncStorage.setItem('orca:mobileStructuredSendOperations:v1', oversized)
    )
    // The durable journal exceeds this bound at 48 unsettled sends; report not-sent rather than lose the operation id (ruling 7).
    expect(refusal.refusal).toBe('too-large')
    expect(writes).toEqual([])
    expect(await pageAsyncStorage.getItem('orca:mobileStructuredSendOperations:v1')).toBeNull()
  })

  // Stop on the first oversized pair; constructing rejected promises for later failures would leave them unhandled.
  it('rejects a batch of two oversize pairs once, leaving no rejection nobody holds', async () => {
    publish()
    const unhandled: unknown[] = []
    const record = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', record)
    try {
      const oversized = 'x'.repeat(PAGE_STORAGE_MAX_VALUE_CHARS + 1)
      const refusal = await refusalOf(
        pageAsyncStorage.multiSet([
          ['orca:mobileStructuredSendOperations:v1', oversized],
          ['orca:custom-accessory-keys', oversized]
        ])
      )
      await new Promise((resolve) => setImmediate(resolve))
      expect(unhandled).toEqual([])
      expect(refusal.key).toBe('orca:mobileStructuredSendOperations:v1')
      expect(writes).toEqual([])
    } finally {
      process.off('unhandledRejection', record)
    }
  })

  it('drops a write the shell would not take, rather than rejecting', async () => {
    granted = false
    await expect(pageAsyncStorage.setItem('orca:pins:host-1', '["wt-1"]')).resolves.toBeUndefined()
    await expect(pageAsyncStorage.getItem('orca:pins:host-1')).resolves.toBeNull()
  })
})
