import '../../../unused-default-rpc-methods.test-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRootDispatch } from '../../../../orchestration/db/root-dispatch-test-fixture'
import { reportWorkerTurnStop } from '../../../../orchestration/worker-turn-stop-report'
import { createOrchestrationRpcHarness } from '../rpc-test-harness'

const NOW = Date.parse('2026-11-03T12:00:00Z')

const harness = createOrchestrationRpcHarness()

afterEach(() => {
  harness.cleanup()
  vi.useRealTimers()
})

function setup() {
  vi.useFakeTimers({ now: NOW })
  const h = harness.setup()
  const task = h.db.createTask({ spec: 'watch PRs' })
  const dispatch = createRootDispatch(h.db, task.id, 'term_worker')
  const params = {
    from: 'term_worker',
    type: 'status',
    subject: 'Waiting',
    body: 'Next scheduled PR check',
    payload: JSON.stringify({ dispatchId: dispatch.id, waitUntil: '4h' })
  }
  const call = (extra: Record<string, unknown> = {}) =>
    harness.call('orchestration.send', { ...params, ...extra }, h.ctx)
  const stop = () =>
    reportWorkerTurnStop(
      h.db,
      { kind: 'local', dispatch },
      {
        from: 'term_worker',
        reason: 'finished',
        stopKey: 'turn:one',
        lastOutput: 'Idle until next wake'
      },
      { getDb: () => h.db, isWaitingForMail: () => false, notify: vi.fn() }
    )
  return { ...h, task, dispatch, params, call, stop }
}

describe('scheduled wait status messages', () => {
  it('persists a worker wait and confirms its deadline in the receipt', async () => {
    const h = setup()
    await expect(h.call()).resolves.toMatchObject({
      scheduledWait: {
        dispatchId: h.dispatch.id,
        until: '2026-11-03T16:00:00.000Z',
        reason: 'Next scheduled PR check'
      }
    })
    h.stop()
    expect(h.db.getUnreadRunMailbox(h.activeRunId!, 100, ['escalation'])).toEqual([])
  })

  it('does not let a different sender or Task declare another workers wait', async () => {
    const h = setup()
    await expect(h.call({ from: 'term_other' })).rejects.toMatchObject({
      code: 'sender_not_assignee'
    })
    await expect(
      h.call({
        payload: JSON.stringify({
          dispatchId: h.dispatch.id,
          taskId: 'task_foreign',
          waitUntil: '4h'
        })
      })
    ).rejects.toMatchObject({ code: 'task_dispatch_mismatch' })
    await expect(h.call({ to: '@all' })).rejects.toMatchObject({ code: 'sender_not_assignee' })
    expect(h.db.getInbox()).toEqual([])
  })

  it('requires a reason and a future deadline before inserting any status', async () => {
    const h = setup()
    await expect(h.call({ body: ' ' })).rejects.toMatchObject({ code: 'invalid_argument' })
    await expect(
      h.call({
        payload: JSON.stringify({ dispatchId: h.dispatch.id, waitUntil: '2026-11-03T11:00:00Z' })
      })
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(h.db.getInbox()).toEqual([])
  })

  it('clears the wait on a new worker status and reports its next clean stop', async () => {
    const h = setup()
    await h.call()
    await h.call({ payload: JSON.stringify({ dispatchId: h.dispatch.id }), body: 'Working again' })
    h.stop()
    expect(h.db.getUnreadRunMailbox(h.activeRunId!, 100, ['escalation'])).toHaveLength(1)
  })

  it('rejects a wait addressed to a settled helper before creating follow-up work', async () => {
    const h = setup()
    const helper = h.db.createStartingWorkerDispatch({
      creator: { kind: 'system' },
      maxDepth: 9,
      taskSpec: 'helper work',
      taskRunId: h.activeRunId,
      startOptions: { agent: 'codex' }
    }).dispatch
    h.db.prepareStartingWorkerAuthority({
      dispatchId: helper.id,
      handle: 'term_helper',
      paneKey: 'tab_helper:leaf_helper',
      processIncarnation: null,
      worktreeId: 'folder::/tmp/folder',
      effects: [],
      setupState: 'not_applicable'
    })
    h.db.markWorkerDispatchReady(helper.id)
    h.db.completeDispatch(helper.id)
    const before = h.db.db.prepare('SELECT count(*) AS count FROM tasks').get()
    await expect(h.call({ to: `dispatch:${helper.id}` })).rejects.toMatchObject({
      code: 'sender_not_assignee'
    })
    expect(h.db.db.prepare('SELECT count(*) AS count FROM tasks').get()).toEqual(before)
    expect(
      h.db.db
        .prepare('SELECT id FROM dispatch_contexts WHERE follow_up_of_dispatch_id = ?')
        .all(helper.id)
    ).toEqual([])
    expect(h.db.getInbox()).toEqual([])
  })

  it('delivers a plain spoofed status without letting another party clear the worker wait', async () => {
    const h = setup()
    await h.call()
    await expect(
      harness.call(
        'orchestration.send',
        {
          ...h.params,
          payload: JSON.stringify({ dispatchId: h.dispatch.id }),
          body: 'Pretend progress'
        },
        { ...h.ctx, orchestrationCompatibilityEvidence: { terminalHandle: 'term_coord' } }
      )
    ).resolves.toMatchObject({ message: { type: 'status' } })
    h.stop()
    expect(h.db.getUnreadRunMailbox(h.activeRunId!, 100, ['escalation'])).toEqual([])
    expect(h.db.db.prepare('SELECT dispatch_id FROM worker_scheduled_waits').all()).toEqual([
      { dispatch_id: h.dispatch.id }
    ])
  })

  it('clears a prior scheduled wait when its worker asks a question in the same turn', async () => {
    const h = setup()
    await h.call()
    await harness.call(
      'orchestration.ask',
      { from: 'term_worker', question: 'Which PR next?', timeoutMs: 0 },
      h.ctx
    )
    await vi.advanceTimersByTimeAsync(14_400_001)
    expect(h.db.getUnreadRunMailbox(h.activeRunId!, 100, ['escalation'])).toEqual([])
    expect(h.db.db.prepare('SELECT * FROM worker_scheduled_waits').all()).toEqual([])
  })

  it('raises an expired wait from the runtime timer without another status or turn edge', async () => {
    const h = setup()
    await h.call({ payload: JSON.stringify({ dispatchId: h.dispatch.id, waitUntil: '30s' }) })
    h.stop()
    await vi.advanceTimersByTimeAsync(30_001)
    const mail = h.db.getUnreadRunMailbox(h.activeRunId!, 100, ['escalation'])
    expect(mail).toHaveLength(1)
    expect(mail[0].subject).toBe('Worker scheduled wait expired')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(h.db.getUnreadRunMailbox(h.activeRunId!, 100, ['escalation'])).toHaveLength(1)
  })
})
