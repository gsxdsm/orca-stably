// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'
import { NativeChatTerminalQueueRequest } from '../../../../shared/native-chat/native-chat-terminal-queue'
import { useNativeChatTerminalQueue } from './use-native-chat-terminal-queue'
import type { NativeChatComposerHandle } from './native-chat-composer-types'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: rpc }))
vi.mock('@/runtime/runtime-terminal-stream', () => ({
  getRemoteRuntimePtyOwner: () => ({ target: { kind: 'local' }, terminal: 'term' })
}))
vi.mock('@/runtime/structured-agent-session-host-capability', () => ({
  useStructuredAgentSessionHostCapabilityState: () => 'supported'
}))
afterEach(() => rpc.mockReset())

describe('desktop terminal queue acknowledgment', () => {
  it.each(['forbidden', 'runtime_timeout', 'transport'])(
    'distinguishes definite refusal from an ambiguous %s outcome',
    async (code) => {
      rpc.mockImplementation(async (_target, _method, params) => {
        if (NativeChatTerminalQueueRequest.parse(params).action.type === 'enqueue') {
          if (code === 'transport') {
            throw new Error('connection closed')
          }
          throw new RuntimeRpcCallError({
            id: 'request',
            ok: false,
            error: { code, message: code },
            _meta: { runtimeId: 'runtime' }
          })
        }
        return {
          revision: '0',
          activity: { state: 'idle', workingSequence: 0 },
          queuedMessages: []
        }
      })
      const hook = renderHook(() =>
        useNativeChatTerminalQueue({
          paneKey: 'tab:leaf',
          ptyId: 'pty',
          enabled: true,
          environmentId: null,
          composerRef: createRef<NativeChatComposerHandle>()
        })
      )
      try {
        await act(async () => {
          await (code === 'forbidden'
            ? expect(hook.result.current.enqueue('hello')).resolves.toBe(false)
            : expect(hook.result.current.enqueue('hello')).rejects.toThrow())
        })
        expect(
          rpc.mock.calls.filter(
            (call) => NativeChatTerminalQueueRequest.parse(call[2]).action.type === 'enqueue'
          )
        ).toHaveLength(1)
      } finally {
        hook.unmount()
      }
    }
  )
})
