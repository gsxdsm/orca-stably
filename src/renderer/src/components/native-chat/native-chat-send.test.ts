import { describe, expect, it } from 'vitest'
import { buildNativeChatSendBytes, isMultilineDraft } from './native-chat-send'

const BEGIN = '\x1b[200~'
const END = '\x1b[201~'

describe('buildNativeChatSendBytes', () => {
  it('single-line text sends as text + carriage return', () => {
    expect(buildNativeChatSendBytes('hello world')).toBe('hello world\r')
  })

  it('multi-line text is bracketed-paste wrapped then submitted', () => {
    const text = 'line one\nline two'
    expect(buildNativeChatSendBytes(text)).toBe(`${BEGIN}${text}${END}\r`)
  })

  it('treats a trailing newline as multi-line', () => {
    expect(buildNativeChatSendBytes('a\n')).toBe(`${BEGIN}a\n${END}\r`)
  })

  it('handles CR-style line breaks as multi-line', () => {
    expect(buildNativeChatSendBytes('a\rb')).toBe(`${BEGIN}a\rb${END}\r`)
  })

  it('sanitizes an embedded bracketed-paste end and bare ESC before framing', () => {
    // A pasted scrollback line could carry its own `\x1b[201~` which would
    // otherwise close the frame early and run the tail as keystrokes.
    const malicious = 'before\nmid\x1b[201~ rm -rf /\x1b tail'
    const bytes = buildNativeChatSendBytes(malicious)
    // No raw ESC survives the sanitize, so the only `\x1b` bytes are the frame.
    expect(bytes.startsWith(BEGIN)).toBe(true)
    expect(bytes.endsWith(`${END}\r`)).toBe(true)
    const inner = bytes.slice(BEGIN.length, bytes.length - END.length - 1)
    expect(inner).not.toContain('\x1b')
    expect(inner).toContain('␛[201~')
  })

  it('neutralizes a stray ESC in the single-line branch', () => {
    const bytes = buildNativeChatSendBytes('hi\x1b there')
    expect(bytes).toBe('hi␛ there\r')
    expect(bytes).not.toContain('\x1b')
  })
})

describe('isMultilineDraft', () => {
  it('is false for single-line', () => {
    expect(isMultilineDraft('one line')).toBe(false)
  })
  it('is true when a newline is present', () => {
    expect(isMultilineDraft('a\nb')).toBe(true)
  })
})
