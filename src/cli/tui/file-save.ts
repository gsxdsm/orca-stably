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
    if (allowOverwrite) {
      await client.call('files.write', { worktree, relativePath, content: editor.content })
    } else {
      // Atomic compare-and-swap at the runtime: only writes if the file still
      // matches what we loaded, so a concurrent external edit isn't clobbered.
      const { result } = await client.call<{ status?: 'saved' | 'conflict' }>(
        'files.writeIfUnchanged',
        { worktree, relativePath, content: editor.content, expectedContent: editor.savedContent }
      )
      if (result.status === 'conflict') {
        return 'conflict'
      }
    }
    editor.markSaved()
    return 'saved'
  } catch {
    return 'failed'
  }
}
