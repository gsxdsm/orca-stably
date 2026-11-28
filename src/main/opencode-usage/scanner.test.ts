import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeOpenCodeUsageDatabase } from './opencode-usage-sqlite-fixture'
import { scanOpenCodeUsageDatabases } from './scanner'

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'orca-opencode-usage-scan-')))
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

function writeStore(dataDir: string, sessionId: string, directory: string, tokens: number): void {
  writeOpenCodeUsageDatabase(join(dataDir, 'opencode.db'), {
    generation: 'v2-only',
    v2Sessions: [{ id: sessionId, directory, tokensInput: tokens }]
  })
}

describe('scanOpenCodeUsageDatabases', () => {
  it('attributes sessions from the default store and every managed account store', async () => {
    const worktreePath = join(root, 'repo', 'wt-1')
    mkdirSync(worktreePath, { recursive: true })
    vi.stubEnv('OPENCODE_DB', '')
    vi.stubEnv('XDG_DATA_HOME', join(root, 'default-data'))
    writeStore(join(root, 'default-data', 'opencode'), 'ses_default', worktreePath, 10)
    const firstAccountDir = join(root, 'accounts', 'a1', 'data', 'opencode')
    const secondAccountDir = join(root, 'accounts', 'a2', 'data', 'opencode')
    writeStore(firstAccountDir, 'ses_a1', worktreePath, 100)
    writeStore(secondAccountDir, 'ses_a2', worktreePath, 1000)

    const result = await scanOpenCodeUsageDatabases(
      [{ repoId: 'repo-1', worktreeId: 'wt-1', path: worktreePath, displayName: 'wt-1' }],
      [],
      undefined,
      [firstAccountDir, secondAccountDir, firstAccountDir, join(root, 'accounts', 'missing')]
    )

    expect(result.processedDatabases).toHaveLength(3)
    expect(
      result.sessions
        .map((session) => [session.sessionId, session.primaryWorktreeId, session.totalInputTokens])
        .sort()
    ).toEqual([
      ['ses_a1', 'wt-1', 100],
      ['ses_a2', 'wt-1', 1000],
      ['ses_default', 'wt-1', 10]
    ])
  })
})
