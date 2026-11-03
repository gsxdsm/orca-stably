import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTranscriptPane, TRANSCRIPT_PANE_PTY_ID } from './agent-transcript-pane-test-harness'
import {
  waitForWorkerAgentReady,
  waitForLaunchedAgentComposer
} from './launched-agent-composer-readiness'
import {
  formatTerminalStartFailure,
  readTerminalStartFailure
} from '../../shared/terminal-start-failure'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') }
}))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('accepted spawn followed by failed startup readiness', () => {
  it('does not retain predecessor output when a replacement exits without printing', async () => {
    const { runtime, terminal } = await createTranscriptPane({
      paneTitle: 'shell',
      foregroundProcess: 'bash',
      launchAgent: 'hermes',
      data: 'ImportError: predecessor client\r\n'
    })
    runtime.onPtyExit(TRANSCRIPT_PANE_PTY_ID, 1, 'inc-1', { providerExitObserved: true })
    expect(runtime.readRecentTerminalOutput(TRANSCRIPT_PANE_PTY_ID)).toContain('predecessor client')
    runtime.onPtySpawned(TRANSCRIPT_PANE_PTY_ID, 'inc-2', { awaitsRegistration: false })
    runtime.registerPty(TRANSCRIPT_PANE_PTY_ID, terminal.worktreeId, null, {
      tabId: 'tab-1',
      leafId: '11111111-1111-4111-8111-111111111111',
      incarnationId: 'inc-2',
      launchedAgent: 'hermes'
    })
    runtime.onPtyExit(TRANSCRIPT_PANE_PTY_ID, 1, 'inc-2', { providerExitObserved: true })
    expect(runtime.getPtyLivenessVerdict(TRANSCRIPT_PANE_PTY_ID)).toMatchObject({
      status: 'exited',
      incarnationId: 'inc-2'
    })
    expect(runtime.readRecentTerminalOutput(TRANSCRIPT_PANE_PTY_ID)).toBe('')
  })

  it('drops a null-incarnation exit tail when registerPty names the replacement', async () => {
    const { runtime, terminal } = await createTranscriptPane({
      paneTitle: 'shell',
      foregroundProcess: 'bash',
      launchAgent: 'hermes',
      data: ''
    })
    const ptyId = 'pty-null-register'
    runtime.registerPty(ptyId, terminal.worktreeId)
    runtime.onPtyData(ptyId, 'ImportError: predecessor client\r\n', Date.now())
    runtime.onPtyExit(ptyId, 1, undefined, { providerExitObserved: true })
    expect(runtime.readRecentTerminalOutput(ptyId)).toContain('predecessor client')
    runtime.registerPty(ptyId, terminal.worktreeId, null, {
      tabId: 'unscoped',
      leafId: 'not-a-leaf',
      incarnationId: 'inc-2',
      launchedAgent: 'hermes'
    })
    runtime.onPtyExit(ptyId, 1, 'inc-2', { providerExitObserved: true })
    expect(runtime.readRecentTerminalOutput(ptyId)).toBe('')
  })

  it('drops a null-incarnation exit tail when spawn stamps the replacement before registerPty', async () => {
    const { runtime, terminal } = await createTranscriptPane({
      paneTitle: 'shell',
      foregroundProcess: 'bash',
      launchAgent: 'hermes',
      data: ''
    })
    const ptyId = 'pty-null-spawn'
    runtime.registerPty(ptyId, terminal.worktreeId)
    runtime.onPtyData(ptyId, 'ImportError: predecessor client\r\n', Date.now())
    runtime.onPtyExit(ptyId, 1, undefined, { providerExitObserved: true })
    expect(runtime.readRecentTerminalOutput(ptyId)).toContain('predecessor client')
    runtime.onPtySpawned(ptyId, 'inc-2', { awaitsRegistration: false })
    runtime.registerPty(ptyId, terminal.worktreeId, null, {
      tabId: 'unscoped',
      leafId: 'not-a-leaf',
      incarnationId: 'inc-2',
      launchedAgent: 'hermes'
    })
    runtime.onPtyExit(ptyId, 1, 'inc-2', { providerExitObserved: true })
    expect(runtime.readRecentTerminalOutput(ptyId)).toBe('')
  })

  it.each(['fresh', 'reattach', 'adopted', 'wrong-incarnation'] as const)(
    'retains the failed Hermes launch output only for its own fresh process (%s)',
    async (context) => {
      const { runtime, handle, terminal } = await createTranscriptPane({
        paneTitle: 'shell',
        foregroundProcess: 'bash',
        launchAgent: 'hermes',
        data: '\x1b]133;C\x07\x1b[31mTraceback: startup failed\x1b[0m\r\nImportError: broken client\r\n',
        ...(context === 'reattach' ? { isReattach: true } : {})
      })
      const creation = {
        ...terminal,
        ...(context === 'adopted' ? { agentSessionDisposition: 'adopted' as const } : {}),
        ...(context === 'wrong-incarnation' ? { incarnationId: 'replacement' } : {})
      }
      runtime.onPtyExit(TRANSCRIPT_PANE_PTY_ID, 1, 'inc-1', {
        providerExitObserved: true,
        cause: { kind: 'exited', exitCode: 1 }
      })
      const error = await waitForWorkerAgentReady(runtime, handle, {
        agent: 'hermes',
        reusesTerminal: false,
        creation,
        timeoutMs: 50
      }).catch((error: unknown) => error)
      expect(error).toBeInstanceOf(Error)
      expect(error).toHaveProperty('terminalExitCause', { kind: 'exited', exitCode: 1 })
      expect(String(error).includes('ImportError: broken client')).toBe(context === 'fresh')
      expect(String(error)).not.toContain('\x1b')
    }
  )

  it.each(
    (['pi', 'codex', 'claude', 'opencode'] as const).flatMap((agent) =>
      [true, false].map((exitBeforeWait) => ({ agent, exitBeforeWait }))
    )
  )(
    'carries the real $agent readiness exit into the start failure (exitBeforeWait=$exitBeforeWait)',
    async ({ agent, exitBeforeWait }) => {
      const { runtime, handle, terminal } = await createTranscriptPane({
        paneTitle: 'shell',
        foregroundProcess: 'bash',
        launchAgent: agent,
        data: ''
      })
      vi.useFakeTimers()
      const exit = () =>
        runtime.onPtyExit(TRANSCRIPT_PANE_PTY_ID, 256, 'inc-1', {
          providerExitObserved: true,
          cause: {
            kind: 'exited',
            exitCode: 256,
            initialOutputDiagnostic: 'git-bash-console-capacity'
          }
        })
      if (exitBeforeWait) {
        exit()
      }
      const result = waitForWorkerAgentReady(runtime, handle, {
        agent,
        reusesTerminal: false,
        creation: terminal,
        timeoutMs: 50
      }).catch((error: unknown) => error)
      if (!exitBeforeWait) {
        exit()
      }
      await vi.advanceTimersByTimeAsync(100)
      expect(await result).toMatchObject({
        message: expect.any(String),
        terminalExitCause: expect.objectContaining({ kind: 'exited' })
      })
      expect(formatTerminalStartFailure(await result)).toContain('128 open terminals on this PC')
      expect(readTerminalStartFailure(await result)?.incarnationId).toBe('inc-1')
    }
  )

  it.each([true, false])(
    'preserves an already-exited generic/reused wait (reused=%s)',
    async (reusesTerminal) => {
      const { runtime, handle } = await createTranscriptPane({
        paneTitle: 'shell',
        foregroundProcess: 'bash',
        launchAgent: 'codex',
        data: ''
      })
      runtime.onPtyExit(TRANSCRIPT_PANE_PTY_ID, 256, 'inc-1', {
        providerExitObserved: true,
        cause: {
          kind: 'exited',
          exitCode: 256,
          ...(reusesTerminal
            ? { initialOutputDiagnostic: 'git-bash-console-capacity' as const }
            : {})
        }
      })
      const ordinary = await runtime
        .waitForTerminal(handle, { condition: 'tui-idle', timeoutMs: 50 })
        .catch((error: unknown) => error)
      const worker = await waitForWorkerAgentReady(runtime, handle, {
        agent: 'codex',
        reusesTerminal,
        timeoutMs: 50
      }).catch((error: unknown) => error)
      for (const error of [ordinary, worker]) {
        expect(error).toBeInstanceOf(Error)
        expect(error).toHaveProperty('message', 'terminal_exited')
        expect(error).toHaveProperty('terminalExitCause', {
          kind: 'exited',
          exitCode: 256,
          ...(reusesTerminal ? { initialOutputDiagnostic: 'git-bash-console-capacity' } : {})
        })
        expect(error).not.toHaveProperty('terminalStartFailure')
        expect(readTerminalStartFailure(error)).toBeUndefined()
        expect(formatTerminalStartFailure(error)).toBeUndefined()
      }
    }
  )

  it.each(['fresh', 'reattach', 'adopted', 'missing', 'wrong-incarnation'] as const)(
    'uses actual create provenance independently of readiness scheduling (%s)',
    async (context) => {
      const { runtime, handle, terminal } = await createTranscriptPane({
        paneTitle: 'shell',
        foregroundProcess: 'bash',
        data: '',
        launchAgent: 'pi',
        ...(context === 'reattach' ? { isReattach: true } : {})
      })
      const creation =
        context === 'missing'
          ? undefined
          : {
              ...terminal,
              ...(context === 'adopted' ? { agentSessionDisposition: 'adopted' as const } : {}),
              ...(context === 'wrong-incarnation' ? { incarnationId: 'replacement' } : {})
            }
      runtime.onPtyExit(TRANSCRIPT_PANE_PTY_ID, 256, 'inc-1', {
        providerExitObserved: true,
        cause: {
          kind: 'exited',
          exitCode: 256,
          initialOutputDiagnostic: 'git-bash-console-capacity'
        }
      })
      vi.useFakeTimers()
      const worker = waitForWorkerAgentReady(runtime, handle, {
        agent: 'pi',
        reusesTerminal: false,
        timeoutMs: 50,
        creation
      }).catch((error: unknown) => error)
      const prompt = waitForLaunchedAgentComposer(
        runtime,
        handle,
        'pi',
        50,
        undefined,
        creation
      ).catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(100)
      for (const result of await Promise.all([worker, prompt])) {
        expect(formatTerminalStartFailure(result) !== undefined).toBe(context === 'fresh')
      }
    }
  )

  it('keeps reused-terminal readiness and ordinary later waits generic', async () => {
    const { runtime, handle } = await createTranscriptPane({
      paneTitle: 'shell',
      foregroundProcess: 'bash',
      data: ''
    })
    const reused = waitForWorkerAgentReady(runtime, handle, {
      agent: 'codex',
      reusesTerminal: true,
      timeoutMs: 50
    }).catch((error: unknown) => error)
    const ordinary = runtime
      .waitForTerminal(handle, { condition: 'tui-idle', timeoutMs: 50 })
      .catch((error: unknown) => error)
    runtime.onPtyExit(TRANSCRIPT_PANE_PTY_ID, 256, 'inc-1', {
      providerExitObserved: true,
      cause: { kind: 'exited', exitCode: 256, initialOutputDiagnostic: 'git-bash-console-capacity' }
    })
    expect(formatTerminalStartFailure(await reused)).toBeUndefined()
    expect(formatTerminalStartFailure(await ordinary)).toBeUndefined()
  })
})
