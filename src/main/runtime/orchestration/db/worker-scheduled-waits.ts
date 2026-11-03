import type { OrchestrationDb } from './orchestration-db'

export const WORKER_SCHEDULED_WAITS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS worker_scheduled_waits (
  dispatch_id TEXT PRIMARY KEY,
  until_ms INTEGER NOT NULL,
  reason TEXT NOT NULL,
  message_id TEXT NOT NULL,
  from_handle TEXT NOT NULL,
  owner_generation INTEGER NOT NULL,
  owner_process TEXT,
  reported INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_worker_scheduled_wait_deadline
  ON worker_scheduled_waits(until_ms) WHERE reported = 0;
`

export type WorkerScheduledWait = {
  dispatch_id: string
  until_ms: number
  reason: string
  message_id: string
  from_handle: string
  owner_generation: number
  owner_process: string | null
  reported: number
}

export function recordWorkerScheduledWait(
  db: OrchestrationDb,
  wait: {
    dispatchId: string
    until: string
    reason: string
    messageId: string
    from: string
  }
): void {
  const owner =
    db.getDispatchContextById(wait.dispatchId) ?? db.getRemoteDispatchAttachment(wait.dispatchId)
  if (!owner) {
    throw new Error('Cannot record a scheduled wait without a Dispatch owner.')
  }
  db.db
    .prepare(`INSERT INTO worker_scheduled_waits
    (dispatch_id, until_ms, reason, message_id, from_handle, owner_generation, owner_process)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dispatch_id) DO UPDATE SET until_ms = excluded.until_ms,
      reason = excluded.reason, message_id = excluded.message_id,
      from_handle = excluded.from_handle, owner_generation = excluded.owner_generation,
      owner_process = excluded.owner_process, reported = 0`)
    .run(
      wait.dispatchId,
      Date.parse(wait.until),
      wait.reason,
      wait.messageId,
      wait.from,
      owner.consumer_generation,
      owner.process_incarnation
    )
  db.workerScheduledWaitListener?.()
}

export function clearWorkerScheduledWait(db: OrchestrationDb, dispatchId: string): void {
  const result = db.db
    .prepare('DELETE FROM worker_scheduled_waits WHERE dispatch_id = ?')
    .run(dispatchId)
  if (result.changes) {
    db.workerScheduledWaitListener?.()
  }
}

export function clearWorkerScheduledWaitForPane(db: OrchestrationDb, paneKey: string): void {
  const dispatch = db.getActiveDispatchForTerminal('', paneKey)
  const id = dispatch?.id ?? db.findActiveRemoteAttachmentForPane(paneKey)?.dispatch_id
  if (id) {
    clearWorkerScheduledWait(db, id)
  }
}

export function clearWorkerScheduledWaitForMessages(db: OrchestrationDb, ids: string[]): void {
  if (ids.length === 0) {
    return
  }
  const placeholders = ids.map(() => '?').join(',')
  const result = db.db
    .prepare(`DELETE FROM worker_scheduled_waits WHERE dispatch_id IN (
    SELECT substr(to_handle, 10) FROM messages
    WHERE id IN (${placeholders}) AND to_handle LIKE 'dispatch:%'
      AND (read = 1 OR delivered_at IS NOT NULL)
  )`)
    .run(...ids)
  if (result.changes) {
    db.workerScheduledWaitListener?.()
  }
}

export function isWorkerScheduledWaitCurrent(
  db: OrchestrationDb,
  wait: WorkerScheduledWait
): boolean {
  const owner =
    db.getDispatchContextById(wait.dispatch_id) ?? db.getRemoteDispatchAttachment(wait.dispatch_id)
  return (
    !!owner &&
    owner.consumer_generation === wait.owner_generation &&
    owner.process_incarnation === wait.owner_process
  )
}

export function deferScheduledWorkerStop(db: OrchestrationDb, dispatchId: string): boolean {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This SELECT returns the side table schema declared above, or no row.
  const wait = db.db
    .prepare('SELECT * FROM worker_scheduled_waits WHERE dispatch_id = ?')
    .get(dispatchId) as WorkerScheduledWait | undefined
  if (!wait) {
    return false
  }
  if (!isWorkerScheduledWaitCurrent(db, wait)) {
    clearWorkerScheduledWait(db, dispatchId)
    return false
  }
  // The deadline scheduler reports expiry once; later idle observations remain the same wait until progress clears it.
  return true
}

const workerScheduledWaitMethods = {
  nextWorkerScheduledWaitAtMs(this: OrchestrationDb): number | null {
    const value = this.db
      .prepare('SELECT MIN(until_ms) AS deadline FROM worker_scheduled_waits WHERE reported = 0')
      .get()?.deadline
    return typeof value === 'number' ? value : null
  },
  clearWorkerScheduledWaitForPane(this: OrchestrationDb, paneKey: string): void {
    clearWorkerScheduledWaitForPane(this, paneKey)
  }
}

export type WorkerScheduledWaitMethods = {
  nextWorkerScheduledWaitAtMs: () => number | null
  clearWorkerScheduledWaitForPane: (paneKey: string) => void
}

export function attachWorkerScheduledWaits(ctor: { prototype: object }): void {
  Object.assign(ctor.prototype, workerScheduledWaitMethods)
}
