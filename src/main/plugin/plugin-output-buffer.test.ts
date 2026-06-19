import { describe, expect, it } from 'vitest'
import { PluginOutputBuffer } from './plugin-output-buffer'

describe('PluginOutputBuffer', () => {
  it('appends lines split on newlines with monotonic seq', () => {
    const buf = new PluginOutputBuffer()
    buf.append('stdout', 'a\nb\n')
    buf.append('stderr', 'c')
    const snap = buf.snapshot()
    expect(snap.map((l) => l.text)).toEqual(['a', 'b', 'c'])
    expect(snap.map((l) => l.channel)).toEqual(['stdout', 'stdout', 'stderr'])
    expect(snap.map((l) => l.seq)).toEqual([0, 1, 2])
  })

  it('keeps a trailing partial line (no newline) but drops the empty trailer after a newline', () => {
    const buf = new PluginOutputBuffer()
    buf.append('stdout', 'x\n') // -> ['x'], no '' entry
    buf.append('stdout', 'y') // -> ['y'] partial
    expect(buf.snapshot().map((l) => l.text)).toEqual(['x', 'y'])
  })

  it('drops oldest lines past capacity (ring behavior)', () => {
    const buf = new PluginOutputBuffer(3)
    buf.append('stdout', '1\n2\n3\n4\n5\n')
    const texts = buf.snapshot().map((l) => l.text)
    expect(texts).toEqual(['3', '4', '5'])
    expect(buf.size).toBe(3)
  })

  it('ignores empty chunks and supports clear', () => {
    const buf = new PluginOutputBuffer()
    buf.append('stdout', '')
    expect(buf.size).toBe(0)
    buf.append('stdout', 'a\n')
    buf.clear()
    expect(buf.snapshot()).toEqual([])
  })

  it('rejects a non-positive capacity', () => {
    expect(() => new PluginOutputBuffer(0)).toThrow()
  })
})
