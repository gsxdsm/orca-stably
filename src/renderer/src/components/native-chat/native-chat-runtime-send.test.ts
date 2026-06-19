import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the IO seam so the test stays pure: we only assert the write order and
// the inter-write delay, not the local-vs-remote pty branching.
const sendRuntimePtyInput = vi.fn()
vi.mock('@/runtime/runtime-terminal-inspection', () => ({
  sendRuntimePtyInput: (...args: unknown[]) => sendRuntimePtyInput(...args)
}))

import {
  sendNativeChatMessage,
  NATIVE_CHAT_SUBMIT_DELAY_MS
} from './native-chat-runtime-send'
import { buildNativeChatPasteBytes, NATIVE_CHAT_SUBMIT } from './native-chat-send'

const SETTINGS = {} as Parameters<typeof sendNativeChatMessage>[0]
const PTY = 'pty-1'

describe('sendNativeChatMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sendRuntimePtyInput.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the framed body immediately, before the Enter', () => {
    sendNativeChatMessage(SETTINGS, PTY, 'hello world')
    // Body lands synchronously; Enter is still pending on the timer.
    expect(sendRuntimePtyInput).toHaveBeenCalledTimes(1)
    expect(sendRuntimePtyInput).toHaveBeenCalledWith(
      SETTINGS,
      PTY,
      buildNativeChatPasteBytes('hello world')
    )
  })

  it('does not fire Enter before the proven 500ms gap (busy-agent safety)', () => {
    sendNativeChatMessage(SETTINGS, PTY, 'hi')
    // A short gap would fire Enter while a busy Codex has not yet landed the
    // paste, submitting an empty box — so nothing must happen before 500ms.
    vi.advanceTimersByTime(NATIVE_CHAT_SUBMIT_DELAY_MS - 1)
    expect(sendRuntimePtyInput).toHaveBeenCalledTimes(1)
  })

  it('writes the bare carriage-return Enter as a separate delayed write', () => {
    sendNativeChatMessage(SETTINGS, PTY, 'hi')
    vi.advanceTimersByTime(NATIVE_CHAT_SUBMIT_DELAY_MS)
    expect(sendRuntimePtyInput).toHaveBeenCalledTimes(2)
    expect(sendRuntimePtyInput).toHaveBeenLastCalledWith(SETTINGS, PTY, NATIVE_CHAT_SUBMIT)
  })

  it('matches orca-runtime writeTerminalAction Enter gap (500ms)', () => {
    expect(NATIVE_CHAT_SUBMIT_DELAY_MS).toBe(500)
  })
})
