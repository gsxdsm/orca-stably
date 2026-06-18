import { describe, expect, it, vi } from 'vitest'
import { saveFileTab } from './file-save'
import { FileEditor } from './file-editor'

function editorWith(content: string): FileEditor {
  const editor = new FileEditor()
  editor.load(content)
  return editor
}

// A fake client: files.read returns `disk`, files.write records the call.
function fakeClient(disk: string, writes: unknown[] = []) {
  return {
    call: vi.fn(async (method: string, params: unknown) => {
      if (method === 'files.write') {
        writes.push(params)
      }
      return { result: { content: disk } }
    })
  }
}

describe('saveFileTab', () => {
  it('writes and marks saved when the disk matches the loaded baseline', async () => {
    const writes: unknown[] = []
    const editor = editorWith('hello')
    editor.handleKey({ type: 'char', value: '!' }) // buffer now "!hello", baseline "hello"
    const client = fakeClient('hello', writes)
    const result = await saveFileTab(client as never, 'id:wt', 'a.txt', editor, false)
    expect(result).toBe('saved')
    expect(writes).toEqual([{ worktree: 'id:wt', relativePath: 'a.txt', content: '!hello' }])
    expect(editor.dirty).toBe(false)
  })

  it('reports a conflict (no write) when the disk changed since load', async () => {
    const writes: unknown[] = []
    const editor = editorWith('hello')
    const client = fakeClient('hello — edited elsewhere', writes)
    const result = await saveFileTab(client as never, 'id:wt', 'a.txt', editor, false)
    expect(result).toBe('conflict')
    expect(writes).toHaveLength(0)
  })

  it('overwrites without re-reading when allowOverwrite is set', async () => {
    const writes: unknown[] = []
    const editor = editorWith('hello')
    const client = fakeClient('changed', writes)
    const result = await saveFileTab(client as never, 'id:wt', 'a.txt', editor, true)
    expect(result).toBe('saved')
    expect(writes).toHaveLength(1)
    // files.read was skipped — only the write happened.
    expect((client.call as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })
})
