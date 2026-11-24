import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { acpLaunchInstructions } from '../acp/launch/acp-instructions'
import { MUSE_LAUNCH_SPEC } from './muse-acp-launch-spec'

it('delivers Muse bot instructions without replacing workspace rules or trusting a symlink', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'orca-muse-rules-'))
  const rules = join(cwd, 'AGENTS.md')
  const input = { cwd, env: {}, sessionId: 'test-session', text: 'Follow the bot rules.' }
  try {
    await writeFile(rules, '# Workspace rules\n')
    await expect(acpLaunchInstructions(MUSE_LAUNCH_SPEC, cwd, input)).resolves.toEqual({
      args: ['--trust-workspace']
    })
    await acpLaunchInstructions(MUSE_LAUNCH_SPEC, cwd, { ...input, text: 'Updated bot rules.' })
    expect(await readFile(rules, 'utf8')).toBe(
      '# Workspace rules\n\n<!-- orca:begin -->\nUpdated bot rules.\n<!-- orca:end -->\n'
    )

    const userRules = join(cwd, 'user-rules.md')
    await writeFile(userRules, 'Leave these rules alone.')
    await rm(rules)
    await symlink(userRules, rules)
    await expect(acpLaunchInstructions(MUSE_LAUNCH_SPEC, cwd, input)).rejects.toThrow(
      'Muse could not write standing instructions to AGENTS.md'
    )
    expect(await readFile(userRules, 'utf8')).toBe('Leave these rules alone.')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})
