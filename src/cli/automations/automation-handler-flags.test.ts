import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime/client'
import { AUTOMATION_HANDLERS } from './automations'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('automations --prompt', () => {
  it('rejects a whitespace-only --prompt on create and passes valid text through unchanged', async () => {
    const client = new RuntimeClient('/unused', undefined, null, 'test-host', 'orca')
    const call = vi.spyOn(client, 'call').mockRejectedValue(new Error('Unexpected runtime call'))
    const flags = new Map([
      ['name', 'Daily review'],
      ['trigger', 'daily'],
      ['provider', 'codex'],
      ['prompt', ' \t\n']
    ])
    const create = () =>
      AUTOMATION_HANDLERS['automations create']({
        flags,
        client,
        cwd: '/unused',
        json: true
      })

    await expect(create()).rejects.toMatchObject({ code: 'invalid_argument' })

    flags.set('prompt', '  변경 사항 요약\n    다음 단계\n')
    call.mockResolvedValue({ id: 'request', ok: true, result: {}, _meta: { runtimeId: 'host' } })
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    await create()
    expect(call).toHaveBeenCalledWith(
      'automation.create',
      expect.objectContaining({ prompt: '  변경 사항 요약\n    다음 단계\n' })
    )
  })

  it('rejects a whitespace-only --prompt on edit', async () => {
    const client = new RuntimeClient('/unused', undefined, null, null, 'orca')
    vi.spyOn(client, 'call').mockRejectedValue(new Error('Unexpected runtime call'))
    const flags = new Map([
      ['id', 'automation'],
      ['prompt', ' \t\n']
    ])

    await expect(
      AUTOMATION_HANDLERS['automations edit']({ flags, client, cwd: '/unused', json: true })
    ).rejects.toMatchObject({ code: 'invalid_argument' })
  })
})
