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
})

describe('isMultilineDraft', () => {
  it('is false for single-line', () => {
    expect(isMultilineDraft('one line')).toBe(false)
  })
  it('is true when a newline is present', () => {
    expect(isMultilineDraft('a\nb')).toBe(true)
  })
})
