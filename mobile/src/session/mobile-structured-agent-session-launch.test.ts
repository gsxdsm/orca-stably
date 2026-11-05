import { describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { markRpcDeliveryUnknown } from '../transport/rpc/rpc-delivery-ambiguity'
import { createMobileStructuredAgentSession } from './mobile-structured-agent-session-launch'
import './mobile-created-structured-sessions'

function clientReturning(
  ...responses: unknown[]
): RpcClient & { sendRequest: ReturnType<typeof vi.fn> } {
  let responseIndex = 0
  const sendRequest = vi.fn(async () => responses[responseIndex++])
  return { sendRequest } as unknown as RpcClient & { sendRequest: ReturnType<typeof vi.fn> }
}

describe('mobile structured agent-session launch', () => {
  it.each([false, true])(
    'keeps the no-message startup fallback from the host (nested refusal %s)',
    async (nested) => {
      const message = "Codex isn't signed in. Run `codex login`. Credentials expired."
      const refusal = {
        code: 'agent_session_operation_invalid',
        message,
        details: { reason: 'notSignedIn' }
      }
      const client = clientReturning(
        { ok: true, result: { supported: true } },
        nested ? { ok: true, result: { ok: false, refusal } } : { ok: false, error: refusal }
      )
      const result = await createMobileStructuredAgentSession(client, 'workspace-1', 'codex')
      expect(result).toEqual({ kind: 'unknown', message })
      expect(
        result.kind !== 'created' && result.kind !== 'unsupported' && result.message
      ).not.toContain('send your message again')
    }
  )
  it('creates through the structured agent-session intent after support is confirmed', async () => {
    const client = clientReturning({ ok: true, result: { supported: true } }, acceptedCreate)

    await expect(
      createMobileStructuredAgentSession(client, 'workspace-1', 'codex')
    ).resolves.toMatchObject({
      kind: 'created',
      sessionId: expect.stringMatching(/^codex_[A-Za-z0-9_]{8,128}$/)
    })
    expect(client.sendRequest).toHaveBeenNthCalledWith(1, 'agentSession.createSupport', {
      worktree: 'id:workspace-1',
      agent: 'codex'
    })
    expect(client.sendRequest).toHaveBeenNthCalledWith(
      2,
      'agentSession.create',
      expect.objectContaining({
        worktree: 'id:workspace-1',
        agent: 'codex',
        envelope: expect.objectContaining({ expectedRuntimeFence: null })
      }),
      expect.objectContaining({ budgetSpansConnect: true })
    )
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: mock call args are untyped; the test asserts each field read below
    const params = client.sendRequest.mock.calls[1]?.[1] as {
      envelope: { sessionId: string; payloadFingerprint: string }
      worktree: string
      agent: 'codex'
    }
    expect(params.envelope.payloadFingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(params.envelope.sessionId).toMatch(/^codex_[A-Za-z0-9_]{8,128}$/)
  })

  it('sends a Hermes resume id in the create fingerprint', async () => {
    const client = clientReturning({ ok: true, result: { supported: true } }, acceptedCreate)
    await createMobileStructuredAgentSession(client, 'workspace-1', 'hermes', {
      resumeFrom: { providerSessionId: '11111111-1111-4111-8111-111111111111' }
    })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: mock call args are untyped; the test asserts each field read below
    const params = client.sendRequest.mock.calls[1]?.[1] as {
      agent: string
      resumeFrom?: { providerSessionId: string }
      envelope: { payloadFingerprint: string }
    }
    expect(params.agent).toBe('hermes')
    expect(params.resumeFrom).toEqual({
      providerSessionId: '11111111-1111-4111-8111-111111111111'
    })
    expect(params.envelope.payloadFingerprint).toMatch(/^[0-9a-f]{64}$/)
  })

  it('creates a Claude session through the same envelope, keyed to the claude provider', async () => {
    const client = clientReturning(
      { ok: true, result: { supported: true } },
      {
        ok: true,
        result: {
          ...acceptedCreateResult,
          value: { ...acceptedCreateResult.value, sessionId: 'claude_session_1' }
        }
      }
    )

    await expect(
      createMobileStructuredAgentSession(client, 'workspace-1', 'claude')
    ).resolves.toMatchObject({ kind: 'created', sessionId: 'claude_session_1' })
    expect(client.sendRequest).toHaveBeenNthCalledWith(1, 'agentSession.createSupport', {
      worktree: 'id:workspace-1',
      agent: 'claude'
    })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: mock call args are untyped; the test asserts each field read below
    const params = client.sendRequest.mock.calls[1]?.[1] as {
      envelope: { sessionId: string; payloadFingerprint: string }
      agent: string
    }
    expect(params.agent).toBe('claude')
    expect(params.envelope.sessionId).toMatch(/^claude_[A-Za-z0-9_]{8,128}$/)
    expect(params.envelope.payloadFingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(mobileCreatedStructuredSession(params.envelope.sessionId)).toEqual({
      worktree: 'id:workspace-1'
    })
  })

  it('names the refusing agent in the failure copy rather than always saying Codex', async () => {
    const client = clientReturning(
      { ok: true, result: { supported: true } },
      { ok: false, error: { code: 'method_not_found', message: '' } }
    )

    await expect(
      createMobileStructuredAgentSession(client, 'workspace-1', 'claude')
    ).resolves.toEqual({ kind: 'failed', message: 'Could not open Claude chat.' })
  })

  it('reports unsupported without creating a terminal when the structured path is unavailable', async () => {
    const client = clientReturning({ ok: true, result: { supported: false, reason: 'remote' } })

    await expect(
      createMobileStructuredAgentSession(client, 'workspace-1', 'codex')
    ).resolves.toEqual({
      kind: 'unsupported',
      reason: 'remote'
    })
    expect(client.sendRequest).toHaveBeenCalledTimes(1)
  })

  it('retries a transient unresolved worktree before deciding structured support', async () => {
    vi.useFakeTimers()
    const client = clientReturning(
      { ok: false, error: { code: 'selector_not_found', message: 'Selector not found' } },
      { ok: true, result: { supported: true } },
      acceptedCreate
    )

    try {
      const result = createMobileStructuredAgentSession(client, 'workspace-1', 'claude')
      await vi.runAllTimersAsync()

      await expect(result).resolves.toMatchObject({ kind: 'created' })
      expect(client.sendRequest.mock.calls.map(([method]) => method)).toEqual([
        'agentSession.createSupport',
        'agentSession.createSupport',
        'agentSession.create'
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not retry a support failure unrelated to worktree resolution', async () => {
    const client = clientReturning({
      ok: false,
      error: { code: 'runtime_busy', message: 'Runtime busy' }
    })

    await expect(
      createMobileStructuredAgentSession(client, 'workspace-1', 'claude')
    ).resolves.toEqual({ kind: 'unsupported' })
    expect(client.sendRequest).toHaveBeenCalledTimes(1)
  })

  it('keeps an unknown create outcome distinct so callers do not create a duplicate terminal', async () => {
    const client = clientReturning({ ok: true, result: { supported: true } })
    client.sendRequest.mockImplementationOnce(async () => ({
      ok: true,
      result: { supported: true }
    }))
    client.sendRequest.mockRejectedValue(markRpcDeliveryUnknown(new Error('response lost')))

    await expect(
      createMobileStructuredAgentSession(client, 'workspace-1', 'codex')
    ).resolves.toMatchObject({
      kind: 'unknown'
    })
    expect(client.sendRequest.mock.calls.map(([method]) => method)).toEqual([
      'agentSession.createSupport',
      'agentSession.create',
      'agentSession.create'
    ])
    expect(client.sendRequest.mock.calls[1]?.[1]).toBe(client.sendRequest.mock.calls[2]?.[1])
  })

  it('keeps the outcome unknown when the idempotent retry cannot be sent', async () => {
    const client = clientReturning({ ok: true, result: { supported: true } })
    client.sendRequest.mockImplementationOnce(async () => ({
      ok: true,
      result: { supported: true }
    }))
    client.sendRequest.mockRejectedValueOnce(markRpcDeliveryUnknown(new Error('response lost')))
    client.sendRequest.mockRejectedValueOnce(new Error('connection interrupted'))

    await expect(
      createMobileStructuredAgentSession(client, 'workspace-1', 'codex')
    ).resolves.toMatchObject({
      kind: 'unknown'
    })
  })
})

it('settles a proven missing-original fork refusal but keeps a lost earlier attempt unknown', async () => {
  const refusal = {
    ok: true,
    result: {
      ok: false,
      refusal: {
        code: 'agent_session_identity_required',
        details: { reason: 'recordMissing' },
        createAttemptRefusedBeforeCommit: true,
        message: 'Source chat unavailable'
      }
    }
  }
  const client = clientReturning({ ok: true, result: { supported: true } }, refusal)
  const forkFrom = { sessionId: 'copied-chat', throughItemId: 'legacy:opencode:source:reply-1' }
  expect(
    (await createMobileStructuredAgentSession(client, 'workspace-1', 'opencode', forkFrom)).kind
  ).toBe('failed')
  const lost = clientReturning({ ok: true, result: { supported: true } }, refusal)
  lost.sendRequest
    .mockImplementationOnce(async () => ({ ok: true, result: { supported: true } }))
    .mockRejectedValueOnce(markRpcDeliveryUnknown(new Error('reply lost')))
    .mockResolvedValueOnce(refusal)
  expect(
    (await createMobileStructuredAgentSession(lost, 'workspace-1', 'opencode', forkFrom)).kind
  ).toBe('unknown')
})

it('settles a proven fork read refusal without settling a prior lost copy', async () => {
  const refusal = {
    ok: true,
    result: {
      ok: false,
      refusal: {
        code: 'agent_session_identity_required',
        details: { reason: 'transcriptUnreadable' },
        createAttemptRefusedBeforeCommit: true,
        message: 'Codex could not read the saved chat.'
      }
    }
  }
  const client = clientReturning({ ok: true, result: { supported: true } }, refusal)
  const forkFrom = { sessionId: 'source-chat', throughItemId: 'codex:source:selected:1' }
  expect(
    (await createMobileStructuredAgentSession(client, 'workspace-1', 'codex', forkFrom)).kind
  ).toBe('failed')
  const lost = clientReturning({ ok: true, result: { supported: true } }, refusal)
  lost.sendRequest
    .mockImplementationOnce(async () => ({ ok: true, result: { supported: true } }))
    .mockRejectedValueOnce(markRpcDeliveryUnknown(new Error('copy reply lost')))
    .mockResolvedValueOnce(refusal)
  expect(
    (await createMobileStructuredAgentSession(lost, 'workspace-1', 'codex', forkFrom)).kind
  ).toBe('unknown')
})
