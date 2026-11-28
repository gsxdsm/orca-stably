import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, expect, it } from 'vitest'
import { journalDatabasePath } from '../../../../native-chat/agent-session-journal/database/journal-host-database'
import { setStructuredAgentSessionHost } from '../../../../native-chat/agent-session-wire/host/structured-agent-session-registry'
import { structuredWorkerSessionForgotten } from './structured-worker-session-forgotten'
import { structuredWorkerProcessIncarnation } from './structured-worker-incarnation'

const SESSION = '9412200c-0000-4000-8000-000000000001'

const NO_ORIGINAL = mkdtempSync(join(tmpdir(), 'orca-forgotten-no-original-'))
// An older Orca's journal no pass has absorbed: its chats may still arrive on a later launch.
const UNABSORBED_ORIGINAL = mkdtempSync(join(tmpdir(), 'orca-forgotten-original-'))
writeFileSync(journalDatabasePath(UNABSORBED_ORIGINAL), '')

// The host is process-wide: a shared test runner must not hand this partial one to the next file.
afterEach(() => setStructuredAgentSessionHost(null))
afterAll(() => {
  rmSync(NO_ORIGINAL, { recursive: true, force: true })
  rmSync(UNABSORBED_ORIGINAL, { recursive: true, force: true })
})

function installStore(store: {
  readOnly?: boolean
  record?: boolean
  unreadable?: boolean
  open?: boolean
  olderOrcaChats?: 'unabsorbed' | 'unreadable'
}): void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the forgotten check reads only `hasSession`, the store's `readOnly`, `getRecord` and `isSessionUnreadable`, and the journal's legacy absorb state.
  setStructuredAgentSessionHost({
    hasSession: (id: string) => id === SESSION && store.open === true,
    deps: {
      store: {
        readOnly: store.readOnly === true,
        getRecord: (id: string) => (id === SESSION && store.record ? { sessionId: id } : null),
        isSessionUnreadable: (id: string) => id === SESSION && store.unreadable === true
      },
      journalDatabase: {
        stateDirectory: store.olderOrcaChats === 'unabsorbed' ? UNABSORBED_ORIGINAL : NO_ORIGINAL,
        readers: {
          database: async () => {
            if (store.olderOrcaChats === 'unreadable') {
              throw new Error('journal reader closed')
            }
            return { kind: 'legacy-absorbed', receipt: null, kept: true }
          }
        }
      }
    }
  } as never)
}

it.each([
  { name: 'gone from a writable store', store: {}, forgotten: true },
  { name: 'still recorded', store: { record: true }, forgotten: false },
  { name: 'recorded but unreadable', store: { unreadable: true }, forgotten: false },
  { name: 'open on the host', store: { open: true }, forgotten: false },
  { name: 'read from a newer build', store: { readOnly: true }, forgotten: false },
  {
    name: 'gone while an older Orca journal may still add it',
    store: { olderOrcaChats: 'unabsorbed' as const },
    forgotten: false
  },
  {
    name: 'gone but the older Orca journal state is unreadable',
    store: { olderOrcaChats: 'unreadable' as const },
    forgotten: false
  }
])('proves a chat worker ended only when its session is $name', async ({ store, forgotten }) => {
  installStore(store)

  await expect(
    structuredWorkerSessionForgotten(structuredWorkerProcessIncarnation(SESSION))
  ).resolves.toBe(forgotten)
})

it('proves nothing without an installed host or for a terminal worker', async () => {
  await expect(
    structuredWorkerSessionForgotten(structuredWorkerProcessIncarnation(SESSION))
  ).resolves.toBe(false)

  installStore({})
  await expect(structuredWorkerSessionForgotten('pty:some-incarnation')).resolves.toBe(false)
  await expect(structuredWorkerSessionForgotten(null)).resolves.toBe(false)
})
