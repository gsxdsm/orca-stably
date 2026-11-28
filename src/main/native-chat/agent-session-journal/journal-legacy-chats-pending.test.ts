import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openJournalDatabase } from './database/journal-database'
import { initializeJournalDomainDatabase } from './database/journal-domain-database'
import { journalDatabasePath } from './database/journal-host-database'
import { JournalSqlReaderPool } from './journal-sql-reader-pool'
import { journalSqlReaderPath } from './journal-sql-worker-bundle.test-fixture'
import {
  JOURNAL_LEGACY_SOURCE_RECEIPT_VERSION,
  type JournalLegacySourceReceipt
} from './database/journal-legacy-source-receipt'
import {
  journalLegacySourcePending,
  readOlderOrcaChatsPending
} from './journal-legacy-chats-pending'

const copied: JournalLegacySourceReceipt = {
  ...JOURNAL_LEGACY_SOURCE_RECEIPT_VERSION,
  disposition: 'copied-source',
  main: { dev: '1', ino: '2', size: '4096', mtimeNs: '5', ctimeNs: '6' },
  wal: { kind: 'empty' }
}
const written: JournalLegacySourceReceipt = {
  ...copied,
  wal: { kind: 'nonempty', size: '8192', ino: '3', mtimeNs: '7' }
}

describe('journalLegacySourcePending', () => {
  it('is settled once every chat in the original as it is now was absorbed', () => {
    expect(
      journalLegacySourcePending({ kept: true, receipt: JSON.stringify(copied) }, copied)
    ).toBe(false)
  })

  it('is settled when no original remains', () => {
    const none: JournalLegacySourceReceipt = {
      ...JOURNAL_LEGACY_SOURCE_RECEIPT_VERSION,
      disposition: 'no-source-at-initialization'
    }
    expect(journalLegacySourcePending({ kept: false, receipt: null }, none)).toBe(false)
  })

  it.each([
    {
      name: 'an older Orca wrote it after the last absorb',
      saved: { kept: true, receipt: JSON.stringify(copied) },
      current: written
    },
    {
      name: 'a failed pass never saved its receipt',
      saved: { kept: false, receipt: JSON.stringify(copied) },
      current: copied
    },
    { name: 'no pass absorbed it yet', saved: { kept: true, receipt: null }, current: copied },
    {
      name: 'its identity cannot be certified',
      saved: { kept: true, receipt: JSON.stringify(copied) },
      current: { ...JOURNAL_LEGACY_SOURCE_RECEIPT_VERSION, disposition: 'uncertifiable' as const }
    }
  ])('is pending when $name', ({ saved, current }) => {
    expect(journalLegacySourcePending(saved, current)).toBe(true)
  })
})

const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).toReversed()) {
    await close()
  }
})

/** This build's launch: absorbs what the older Orca wrote, then reads through its reader pool. */
async function launch(stateDirectory: string) {
  const filename = await initializeJournalDomainDatabase(stateDirectory)
  const readers = new JournalSqlReaderPool(
    filename,
    journalDatabasePath(stateDirectory),
    journalSqlReaderPath()
  )
  cleanup.push(() => readers.close())
  return { readers, stateDirectory }
}

it('reads older Orca chats as pending only until a launch absorbs what that build wrote', async () => {
  const stateDirectory = mkdtempSync(join(tmpdir(), 'orca-legacy-chats-pending-'))
  cleanup.push(() => rmSync(stateDirectory, { recursive: true, force: true }))
  const { db: original } = openJournalDatabase(journalDatabasePath(stateDirectory))
  cleanup.push(() => original.close())

  expect(await readOlderOrcaChatsPending(await launch(stateDirectory))).toBe(false)

  // A downgrade writes the original again; until a launch absorbs it, a missing chat may arrive.
  original
    .prepare('INSERT INTO agent_session_records VALUES(?,?)')
    .run('older', JSON.stringify({ sessionId: 'older', lease: { sessionId: 'older' } }))
  original.pragma('wal_checkpoint(TRUNCATE)')
  const current = await launch(stateDirectory)
  expect(await readOlderOrcaChatsPending(current)).toBe(false)
  original
    .prepare('INSERT INTO agent_session_records VALUES(?,?)')
    .run('later', JSON.stringify({ sessionId: 'later', lease: { sessionId: 'later' } }))
  original.pragma('wal_checkpoint(TRUNCATE)')
  expect(await readOlderOrcaChatsPending(current)).toBe(true)

  expect(await readOlderOrcaChatsPending(await launch(stateDirectory))).toBe(false)
})
