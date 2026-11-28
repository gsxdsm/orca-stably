import { journalDatabasePath } from './database/journal-host-database'
import {
  journalLegacySourceAbsorbed,
  readJournalLegacySourceReceipt,
  type JournalLegacyAbsorbedSource,
  type JournalLegacySourceReceipt
} from './database/journal-legacy-source-receipt'
import type { JournalSqlDatabase } from './database/journal-sql-database'

/**
 * An original whose chats a later launch's reconcile would still read: a failed or skipped pass
 * leaves the saved receipt behind it, so a chat missing here may yet be absorbed.
 */
export function journalLegacySourcePending(
  saved: JournalLegacyAbsorbedSource,
  current: JournalLegacySourceReceipt
): boolean {
  return (
    current.disposition !== 'no-source-at-initialization' &&
    !journalLegacySourceAbsorbed(saved, current)
  )
}

/** Chats an older Orca saved that a later launch may still absorb into this store. */
export async function readOlderOrcaChatsPending(
  database: Pick<JournalSqlDatabase, 'readers' | 'stateDirectory'>
): Promise<boolean> {
  const [saved, current] = await Promise.all([
    database.readers.database({ kind: 'legacy-absorbed' }),
    readJournalLegacySourceReceipt(journalDatabasePath(database.stateDirectory))
  ])
  if (saved.kind !== 'legacy-absorbed') {
    throw new Error('journal reader returned no legacy absorb state')
  }
  return journalLegacySourcePending(saved, current)
}
