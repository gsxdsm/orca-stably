import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TERMINAL_LIVE_INPUT_MAX_BYTES,
  clearTerminalLiveInputFocusTimer,
  diffTerminalLiveWordBuffer,
  getTerminalLiveSpecialKeyBytes,
  isTerminalLiveInputWithinByteLimit,
  scheduleTerminalLiveInputFocus,
  type TerminalLiveInputFocusTimerRef
} from './terminal-live-input'

function createTimerRef(): TerminalLiveInputFocusTimerRef {
  return { current: null }
}

describe('terminal live input', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps phone keyboard special keys to PTY bytes', () => {
    expect(getTerminalLiveSpecialKeyBytes('Backspace')).toBe('\x7f')
    expect(getTerminalLiveSpecialKeyBytes('Enter')).toBeNull()
    expect(getTerminalLiveSpecialKeyBytes('a')).toBeNull()
  })

  it('diffs autocorrect rewrites of the current word into backspaces plus text', () => {
    expect(diffTerminalLiveWordBuffer('', 'h')).toEqual({ bytes: 'h', buffer: 'h' })
    expect(diffTerminalLiveWordBuffer('teh', 'the ')).toEqual({
      bytes: '\x7f\x7fhe ',
      buffer: ''
    })
    expect(diffTerminalLiveWordBuffer('gi', 'git status')).toEqual({
      bytes: 't status',
      buffer: 'status'
    })
    expect(diffTerminalLiveWordBuffer('ab', 'a')).toEqual({ bytes: '\x7f', buffer: 'a' })
  })

  it('enforces the paste-sized byte budget', () => {
    expect(isTerminalLiveInputWithinByteLimit('hello')).toBe(true)
    expect(isTerminalLiveInputWithinByteLimit('x'.repeat(TERMINAL_LIVE_INPUT_MAX_BYTES))).toBe(true)
    expect(isTerminalLiveInputWithinByteLimit('x'.repeat(TERMINAL_LIVE_INPUT_MAX_BYTES + 1))).toBe(
      false
    )
    expect(
      isTerminalLiveInputWithinByteLimit('é'.repeat(TERMINAL_LIVE_INPUT_MAX_BYTES / 2 + 1))
    ).toBe(false)
  })

  it('replaces pending deferred focus work', () => {
    vi.useFakeTimers()
    const timerRef = createTimerRef()
    const staleFocus = vi.fn()
    const nextFocus = vi.fn()

    scheduleTerminalLiveInputFocus(timerRef, staleFocus)
    scheduleTerminalLiveInputFocus(timerRef, nextFocus)
    vi.runOnlyPendingTimers()

    expect(staleFocus).not.toHaveBeenCalled()
    expect(nextFocus).toHaveBeenCalledTimes(1)
    expect(timerRef.current).toBeNull()
  })

  it('clears pending deferred focus work', () => {
    vi.useFakeTimers()
    const timerRef = createTimerRef()
    const focus = vi.fn()

    scheduleTerminalLiveInputFocus(timerRef, focus)
    clearTerminalLiveInputFocusTimer(timerRef)
    vi.runOnlyPendingTimers()

    expect(focus).not.toHaveBeenCalled()
    expect(timerRef.current).toBeNull()
  })
})
