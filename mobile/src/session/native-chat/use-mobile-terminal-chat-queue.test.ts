import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../../transport/rpc-client'
import { useMobileTerminalChatQueue } from './use-mobile-terminal-chat-queue'
import {
  NativeChatTerminalQueueRequest,
  type NativeChatTerminalQueueSnapshot
} from '../../../../src/shared/native-chat/native-chat-terminal-queue'
import { NATIVE_CHAT_TERMINAL_QUEUE_CAPABILITY } from '../../../../src/shared/native-chat/native-chat-terminal-queue-capability'

describe('mobile Hermes terminal queue', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(() => {
    act(() => renderer?.unmount())
    vi.useRealTimers()
  })

  it('accepts multiple busy sends, reuses queue cards and refreshes idle after reconnect', async () => {
    vi.useFakeTimers()
    let api: ReturnType<typeof useMobileTerminalChatQueue> | undefined
    let revision = 0
    const snapshot: NativeChatTerminalQueueSnapshot = {
      revision: '0',
      activity: { state: 'working', workingSequence: 1 },
      queuedMessages: []
    }
    const sendRequest = vi.fn<RpcClient['sendRequest']>(async (method, params) => {
      expect(method).toBe('nativeChat.terminalQueue')
      const { action } = NativeChatTerminalQueueRequest.parse(params)
      if (action.type === 'enqueue') {
        snapshot.queuedMessages = [
          ...snapshot.queuedMessages,
          {
            messageId: action.messageId,
            position: ++revision,
            state: 'waiting',
            body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: action.text }] }
          }
        ]
        snapshot.revision = String(revision)
      }
      if (action.type === 'delete') {
        snapshot.queuedMessages = snapshot.queuedMessages.filter(
          (card) => !action.messageIds.includes(card.messageId)
        )
        snapshot.revision = String(++revision)
      }
      if (action.type === 'edit') {
        snapshot.queuedMessages = snapshot.queuedMessages.map((card) =>
          card.messageId === action.messageId ? { ...card, paused: true } : card
        )
        snapshot.revision = String(++revision)
      }
      return { id: 'q', ok: true, result: structuredClone(snapshot), _meta: { runtimeId: 'r' } }
    })
    const client: RpcClient = {
      sendRequest,
      subscribe: () => () => {},
      updateTerminalSubscriptionViewport: () => {},
      getState: () => 'connected',
      getReconnectAttempt: () => 0,
      getLastConnectedAt: () => 1,
      onStateChange: () => () => {},
      notifyForeground: () => {},
      close: () => {}
    }
    const appendText = vi.fn(() => true)
    function Harness({ enabled = true }: { enabled?: boolean }) {
      api = useMobileTerminalChatQueue({
        client,
        terminal: 'term',
        enabled,
        hostCapabilities: [NATIVE_CHAT_TERMINAL_QUEUE_CAPABILITY],
        appendText
      })
      return null
    }
    await act(async () => {
      renderer = create(createElement(Harness))
    })
    await act(async () => {
      expect(await api?.enqueue('First')).toBe('queued')
      expect(await api?.enqueue('Second')).toBe('queued')
    })
    expect(api?.controls.cards.map((card) => card.text)).toEqual(['First', 'Second'])
    expect(api?.controls.cards.every((card) => card.waitsForAgent)).toBe(true)
    const firstId = api?.controls.cards[0]?.messageId
    expect(firstId).toBeDefined()
    await act(async () => {
      await api?.controls.edit?.(firstId!)
    })
    expect(appendText).toHaveBeenCalledWith('First')
    expect(api?.controls.cards.map((card) => card.text)).toEqual(['Second'])
    await act(async () => {
      renderer?.update(createElement(Harness, { enabled: false }))
    })
    snapshot.activity = { state: 'idle', workingSequence: 2 }
    snapshot.queuedMessages = []
    snapshot.revision = String(++revision)
    await act(async () => {
      renderer?.update(createElement(Harness))
    })
    expect(api?.activity?.state).toBe('idle')
    expect(api?.controls.cards).toEqual([])
  })
})
