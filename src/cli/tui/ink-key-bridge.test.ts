import { describe, expect, it } from 'vitest'
import { inkKeyToLogical, type InkKey } from './ink-key-bridge'

function key(overrides: Partial<InkKey> = {}): InkKey {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    return: false,
    escape: false,
    tab: false,
    backspace: false,
    delete: false,
    ctrl: false,
    ...overrides
  }
}

describe('inkKeyToLogical', () => {
  it('maps Ink arrow/named flags to logical keys', () => {
    expect(inkKeyToLogical('', key({ upArrow: true }))).toEqual({ type: 'up' })
    expect(inkKeyToLogical('', key({ downArrow: true }))).toEqual({ type: 'down' })
    expect(inkKeyToLogical('', key({ return: true }))).toEqual({ type: 'enter' })
    expect(inkKeyToLogical('', key({ escape: true }))).toEqual({ type: 'escape' })
    expect(inkKeyToLogical('', key({ backspace: true }))).toEqual({ type: 'backspace' })
  })

  it('maps Ctrl combinations', () => {
    expect(inkKeyToLogical('c', key({ ctrl: true }))).toEqual({ type: 'ctrl', value: 'c' })
  })

  it('maps printable characters', () => {
    expect(inkKeyToLogical('q', key())).toEqual({ type: 'char', value: 'q' })
    expect(inkKeyToLogical('?', key())).toEqual({ type: 'char', value: '?' })
  })

  it('returns null for empty/unhandled input', () => {
    expect(inkKeyToLogical('', key())).toBeNull()
  })
})
