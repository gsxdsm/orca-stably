import type { TuiRpcClient } from './tui-rpc-client'
import type { FileEditor } from './file-editor'

export type SaveResult = 'saved' | 'conflict' | 'failed'

/** Write the editor buffer via files.write, guarding against clobbering an
 *  external change: unless allowOverwrite, re-read the file first and report
 *  'conflict' when it changed on disk since the editor loaded it. */
export async function saveFileTab(
  client: TuiRpcClient,
  worktree: string,
  relativePath: string,
  editor: FileEditor,
  allowOverwrite: boolean
): Promise<SaveResult> {
  try {
    if (!allowOverwrite) {
      const { result } = await client.call<{ content?: string }>('files.read', {
        worktree,
        relativePath
      })
      if ((result.content ?? '') !== editor.savedContent) {
        return 'conflict'
      }
    }
    await client.call('files.write', { worktree, relativePath, content: editor.content })
    editor.markSaved()
    return 'saved'
  } catch {
    return 'failed'
  }
}
