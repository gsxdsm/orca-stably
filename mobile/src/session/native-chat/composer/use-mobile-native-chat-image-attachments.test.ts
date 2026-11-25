import { resetMobileNativeChatDraftInputsForTests } from './mobile-native-chat-draft-inputs'
import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import '../../../../../src/shared/agent-launch/startup/agent-tui-input-clear'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../../../transport/rpc/rpc-client-contract'
import { resetMobileNativeChatStaleInputForTests } from '../mobile-native-chat-stale-input'
import { resetMobileNativeChatTerminalWritesForTests } from '../mobile-native-chat-terminal-write-lock'
import {
  makeClient,
  methodNotFound,
  ok,
  sendResult
} from './mobile-native-chat-image-attachment-test-client'
import { useMobileNativeChatImageAttachments } from './use-mobile-native-chat-image-attachments'

// Stub the media seam so direct Expo imports would expose unsupported Flow syntax and fail the transform.
const pick = vi.hoisted(() => vi.fn())
const ids = vi.hoisted(() => ({ next: 0 }))
vi.mock('../../../../../src/shared/non-secure-context-uuid', () => ({
  createNonSecureContextUuid: () => `img-${++ids.next}`
}))
vi.mock('../../../platform/media-picker', () => ({ useMediaPicker: () => ({ pickImages: pick }) }))

type HookArgs = Parameters<typeof useMobileNativeChatImageAttachments>[0]
type Hook = ReturnType<typeof useMobileNativeChatImageAttachments>

const SCOPE_A = 'h\0w\0tab-a'

function baseArgs(overrides: Partial<HookArgs> & Pick<HookArgs, 'client'>): HookArgs {
  return {
    agent: 'claude',
    activeHandleRef: { current: 'term-1' },
    deviceTokenRef: { current: null },
    getActiveWorktreeConnectionId: async () => null,
    connState: 'connected',
    scopeKey: SCOPE_A,
    enabled: true,
    structuredNativeChat: false,
    showToast: vi.fn(),
    onSendError: vi.fn(),
    baseSend: vi.fn().mockResolvedValue('accepted'),
    readSeededLaunchDraft: () => null,
    sleep: async () => {},
    ...overrides
  }
}

describe('useMobileNativeChatImageAttachments', () => {
  let renderer: ReactTestRenderer | null = null
  let hook: Hook | null = null

  function Harness({ args }: { args: HookArgs }): null {
    hook = useMobileNativeChatImageAttachments(args)
    return null
  }

  beforeEach(() => {
    resetMobileNativeChatDraftInputsForTests()
    ids.next = 0
    pick.mockReset()
    resetMobileNativeChatStaleInputForTests()
    resetMobileNativeChatTerminalWritesForTests()
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    hook = null
  })

  function mount(args: HookArgs): void {
    act(() => {
      renderer = create(createElement(Harness, { args }))
    })
  }

  function update(args: HookArgs): void {
    act(() => {
      renderer!.update(createElement(Harness, { args }))
    })
  }

  it('spends one budget and one press time across the image paste and the text body', async () => {
    vi.useFakeTimers()
    try {
      pick.mockResolvedValue([{ base64: 'AAAA', uri: 'file:///a.jpg' }])
      const client = makeClient([
        methodNotFound('start'),
        ok('save', '/tmp/a.png'),
        sendResult(true),
        sendResult(true)
      ])
      const slowClient: Pick<RpcClient, 'sendRequest'> = {
        sendRequest: async (method, params) => {
          if (method === 'terminal.send') {
            // A slow relay: each write burns 5s of the action's budget.
            vi.setSystemTime(Date.now() + 5_000)
          }
          return client.sendRequest(method, params)
        }
      }
      const baseSend = vi.fn().mockResolvedValue('accepted')
      mount(baseArgs({ client: slowClient as RpcClient, baseSend }))

      await act(async () => {
        await hook!.attachImage('library')
      })
      const pressedAt = Date.now()
      await act(async () => {
        await hook!.sendNativeChat('look at this')
      })

      // The paste spends 10s of the shared 15s budget; text gets the remainder plus deliberate settle, not a fresh deadline.
      const deadline = baseSend.mock.calls[0]?.[2] as number
      expect(deadline - Date.now()).toBe(5_300)
      expect(baseSend.mock.calls[0]?.[4]).toBe(pressedAt)
    } finally {
      vi.useRealTimers()
    }
  })

  it('passes the Hermes startup budget through to the text send', async () => {
    vi.useFakeTimers()
    try {
      const client = makeClient([])
      const baseSend = vi.fn().mockResolvedValue('accepted')
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This test only calls the mocked sendRequest member.
      mount(baseArgs({ client: client as unknown as RpcClient, agent: 'hermes', baseSend }))
      const pressedAt = Date.now()
      await act(async () => {
        await hook!.sendNativeChat('hello')
      })
      expect(baseSend.mock.calls[0]?.[2]).toBe(pressedAt + 75_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('scopes chips to the tab that attached them', async () => {
    pick.mockResolvedValue([{ base64: 'AAAA', uri: 'file:///a.jpg' }])
    const client = makeClient([methodNotFound('start'), ok('save', '/tmp/a.png')])
    const baseSend = vi.fn().mockResolvedValue('accepted')
    const args = baseArgs({ client: client as unknown as RpcClient, baseSend })
    mount(args)
    await act(async () => {
      await hook!.attachImage('library')
    })
    expect(hook!.attachments).toHaveLength(1)

    update({ ...args, scopeKey: 'h\0w\0tab-b' })
    expect(hook!.attachments).toEqual([])
    await act(async () => {
      await hook!.sendNativeChat('hi')
    })
    expect(baseSend).toHaveBeenCalled()
    expect(client.calls.some((c) => c.method === 'terminal.send')).toBe(false)

    update(args)
    expect(hook!.attachments).toHaveLength(1)
  })

  it('keeps isAttaching true when a cancelled pick overlaps a genuine in-flight upload', async () => {
    // Hold a real upload after its counter increment; a concurrent cancelled pick must not decrement work it never started.
    let releaseConnection: ((id: string | null) => void) | null = null
    const client = makeClient([methodNotFound('start'), ok('save', '/tmp/a.png')])
    const args = baseArgs({
      client: client as unknown as RpcClient,
      getActiveWorktreeConnectionId: () =>
        new Promise<string | null>((resolve) => {
          releaseConnection = resolve
        })
    })
    mount(args)

    pick.mockResolvedValue([{ base64: 'AAAA', uri: 'file:///a.jpg' }])
    let firstAttach: Promise<void> | null = null
    await act(async () => {
      firstAttach = hook!.attachImage('library')
      for (let i = 0; i < 50 && !releaseConnection; i++) {
        await Promise.resolve()
      }
    })
    expect(releaseConnection).not.toBeNull()
    expect(hook!.isAttaching).toBe(true)

    pick.mockResolvedValue([])
    await act(async () => {
      await hook!.attachImage('library')
    })
    expect(hook!.isAttaching).toBe(true)

    await act(async () => {
      releaseConnection!('conn-1')
      await firstAttach
    })
    expect(hook!.isAttaching).toBe(false)
    expect(hook!.attachments).toHaveLength(1)
  })
})
