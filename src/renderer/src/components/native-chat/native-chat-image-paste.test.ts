import { describe, expect, it } from 'vitest'
import { getAgentImageHandling, resolveImagePaste } from './native-chat-image-paste'

describe('image paste agent map', () => {
  it('known path-accepting agent injects the temp file path', () => {
    expect(getAgentImageHandling('claude')).toBe('path')
    const result = resolveImagePaste('claude', '/tmp/orca-img-123.png')
    expect(result).toEqual({ kind: 'inject', reference: '/tmp/orca-img-123.png' })
  })

  it('codex also injects a path', () => {
    expect(resolveImagePaste('codex', '/tmp/x.png')).toEqual({
      kind: 'inject',
      reference: '/tmp/x.png'
    })
  })

  it('unknown/custom agent is unsupported', () => {
    expect(getAgentImageHandling('some-custom-agent')).toBe('unsupported')
    expect(resolveImagePaste('some-custom-agent', '/tmp/x.png')).toEqual({
      kind: 'unsupported',
      agent: 'some-custom-agent'
    })
  })
})
