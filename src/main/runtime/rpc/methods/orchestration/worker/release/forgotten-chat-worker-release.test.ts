import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { journalDatabasePath } from '../../../../../../native-chat/agent-session-journal/database/journal-host-database'
import { createOrcaSessionId } from '../../../../../../../shared/agent-session/identity/orca-session-address'
import { setStructuredAgentSessionHost } from '../../../../../../native-chat/agent-session-wire/host/structured-agent-session-registry'
import {
  mintStructuredWorkerHandle,
  mintStructuredWorkerPaneKey
} from '../../../../../orchestration/terminal-authority/structured-sessions/structured-worker-identity'
import { structuredWorkerProcessIncarnation } from '../../../../../orchestration/terminal-authority/structured-sessions/structured-worker-incarnation'
import { createWorkerReleaseFixture } from './worker-release.test-fixture'

const NO_ORIGINAL = mkdtempSync(join(tmpdir(), 'orca-release-no-original-'))
// An older Orca's journal whose absorb failed: the next launch retries it.
const UNABSORBED_ORIGINAL = mkdtempSync(join(tmpdir(), 'orca-release-original-'))
writeFileSync(journalDatabasePath(UNABSORBED_ORIGINAL), '')

// The host is process-wide: a shared test runner must not hand this partial one to the next file.
afterEach(() => setStructuredAgentSessionHost(null))
afterAll(() => {
  rmSync(NO_ORIGINAL, { recursive: true, force: true })
  rmSync(UNABSORBED_ORIGINAL, { recursive: true, force: true })
})

/** A settled chat worker whose own chat record no longer exists, as after the deleted-workspace sweep. */
function settledChatWorkerWithoutRecord() {
  const fixture = createWorkerReleaseFixture()
  const { db, runtime, activeRunId } = fixture
  vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
  const sessionId = createOrcaSessionId(randomUUID)
  const task = db.createTask({ spec: 'chat worker', runId: activeRunId })
  const { dispatch } = db.createStartingWorkerDispatch({
    creator: { kind: 'session', orcaSessionId: createOrcaSessionId(randomUUID) },
    maxDepth: Number.MAX_SAFE_INTEGER,
    taskId: task.id,
    startOptions: {}
  })
  db.prepareStartingWorkerAuthority({
    dispatchId: dispatch.id,
    handle: mintStructuredWorkerHandle(),
    paneKey: mintStructuredWorkerPaneKey(sessionId),
    processIncarnation: structuredWorkerProcessIncarnation(sessionId),
    hostScope: JSON.stringify({ kind: 'local', hostId: 'local' }),
    worktreeId: 'repo::worktree',
    setupState: 'not_applicable',
    effects: [],
    terminalOwnership: 'created'
  })
  expect(
    db.settleWorkerReport({
      taskId: task.id,
      dispatchId: dispatch.id,
      outcome: 'succeeded',
      result: 'done'
    }).action
  ).toBe('settled')
  const resource = db.getWorkerTerminalResourceByOwner(dispatch.id)!
  expect(resource.release_state).toBe('not_requested')
  // Loads a writable store that no longer holds the chat.
  const loadRecords = ({ olderOrcaChatsUnabsorbed = false } = {}) =>
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: release reads only these host and store members.
    setStructuredAgentSessionHost({
      hasSession: () => false,
      isSessionTabVisible: () => false,
      publishBackgroundTasks: () => {},
      reads: { agentStarting: () => false },
      deps: {
        store: {
          readOnly: false,
          getRecord: () => null,
          getConversation: () => null,
          listConversations: () => [],
          isSessionUnreadable: () => false,
          getVisibleSessionTabIndex: () => ({ present: false, sessionIds: [] })
        },
        journalDatabase: {
          stateDirectory: olderOrcaChatsUnabsorbed ? UNABSORBED_ORIGINAL : NO_ORIGINAL,
          readers: {
            database: async () => ({ kind: 'legacy-absorbed', receipt: null, kept: false })
          }
        }
      }
    } as never)
  return { ...fixture, dispatchId: dispatch.id, resourceId: resource.id, sessionId, loadRecords }
}

describe('releasing a settled chat worker whose chat record is gone', () => {
  it('settles the release, still pointing at the chat in case its record comes back', async () => {
    const { db, call, dispatchId, resourceId, sessionId, loadRecords } =
      settledChatWorkerWithoutRecord()
    loadRecords()

    const receipt = await call('orchestration.workerRelease', { dispatch: dispatchId })

    expect(receipt).toMatchObject({
      state: 'released',
      processAction: 'none',
      archive: { source: 'transcript', status: 'unavailable' }
    })
    expect(db.getWorkerTerminalResource(resourceId)).toMatchObject({
      release_state: 'released',
      archive_status: 'unavailable'
    })
    // A record an older build wrote may be absorbed on a later launch; the read then finds it again.
    const archive = db.getWorkerTerminalArchive(dispatchId)!
    expect(archive.kind).toBe('structured_journal')
    const content = JSON.parse(archive.content)
    expect(content).toMatchObject({
      processIncarnation: structuredWorkerProcessIncarnation(sessionId)
    })
    // The provider is unknown without the record, so the read resolves it instead of a stored Claude guess.
    expect(content).not.toHaveProperty('agent')
    await expect(call('orchestration.workerRead', { dispatch: dispatchId })).rejects.toMatchObject({
      code: 'archive_unavailable'
    })
  })

  it('stays unresolved while an older Orca journal may still add the chat on a later launch', async () => {
    const { db, call, dispatchId, resourceId, loadRecords } = settledChatWorkerWithoutRecord()
    loadRecords({ olderOrcaChatsUnabsorbed: true })

    await expect(
      call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'release_unknown', processAction: 'none' })
    // Nothing is pinned unavailable, so the release after that absorb captures the output.
    expect(db.getWorkerTerminalResource(resourceId)?.archive_status).not.toBe('unavailable')
    expect(db.getWorkerTerminalArchive(dispatchId)).toBeUndefined()
  })

  it('stays unresolved while the chat records are not loaded, then settles once they are', async () => {
    const { call, dispatchId, loadRecords } = settledChatWorkerWithoutRecord()

    await expect(
      call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'release_unknown', processAction: 'none' })

    loadRecords()
    await expect(
      call('orchestration.workerRelease', { dispatch: dispatchId })
    ).resolves.toMatchObject({ state: 'released', processAction: 'none' })
  })
})
