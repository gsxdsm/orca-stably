import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveSessionFilePath } from './session-file-resolver'

let tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

async function makeRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

describe('resolveSessionFilePath', () => {
  it('globs Claude project subdirs for <sessionId>.jsonl', async () => {
    const root = await makeRoot('orca-native-chat-resolve-claude-')
    const claudeProjectsDir = join(root, 'claude-projects')
    const projectDir = join(claudeProjectsDir, '-Users-ada-repo')
    await mkdir(projectDir, { recursive: true })
    const target = join(projectDir, 'sess-123.jsonl')
    await writeFile(target, '{}\n')

    const resolved = await resolveSessionFilePath('claude', 'sess-123', { claudeProjectsDir })
    expect(resolved).toBe(target)
  })

  it('matches Codex rollout files by session id suffix', async () => {
    const root = await makeRoot('orca-native-chat-resolve-codex-')
    const codexSessionsDir = join(root, 'codex-sessions')
    const dayDir = join(codexSessionsDir, '2026', '06', '04')
    await mkdir(dayDir, { recursive: true })
    const target = join(dayDir, 'rollout-2026-06-04T10-00-00-abc-session.jsonl')
    await writeFile(target, '{}\n')

    const resolved = await resolveSessionFilePath('codex', 'abc-session', { codexSessionsDir })
    expect(resolved).toBe(target)
  })

  it('honors CODEX_HOME for the default Codex sessions dir', async () => {
    const root = await makeRoot('orca-native-chat-resolve-codex-home-')
    const codexHome = join(root, 'custom-codex-home')
    const dayDir = join(codexHome, 'sessions', '2026', '06', '05')
    await mkdir(dayDir, { recursive: true })
    const target = join(dayDir, 'rollout-xyz-session.jsonl')
    await writeFile(target, '{}\n')

    const previous = process.env.CODEX_HOME
    process.env.CODEX_HOME = codexHome
    try {
      const resolved = await resolveSessionFilePath('codex', 'xyz-session')
      expect(resolved).toBe(target)
    } finally {
      if (previous === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = previous
      }
    }
  })

  it('returns null when no transcript matches', async () => {
    const root = await makeRoot('orca-native-chat-resolve-missing-')
    const claudeProjectsDir = join(root, 'claude-projects')
    await mkdir(claudeProjectsDir, { recursive: true })
    expect(await resolveSessionFilePath('claude', 'nope', { claudeProjectsDir })).toBeNull()
  })

  it('returns null for unsupported agents', async () => {
    expect(await resolveSessionFilePath('gemini', 'whatever')).toBeNull()
  })
})
