import { decodeKey } from './tty-key-adapter'
import {
  clampFileIndex,
  emptyFileBrowser,
  fileIndexAtBodyRow,
  selectedFile,
  type FileBrowserState,
  type FileEntry
} from './file-browser'

type RpcClient = {
  call<T>(method: string, params?: unknown): Promise<{ result: T }>
}

type FileBrowserDeps = {
  worktreeId: () => string | undefined
  bodyHeight: () => number
  onChange: () => void
  /** Called after a file is opened as a tab so the controller can focus it. */
  onOpened: (relativePath: string) => void
}

/** Owns the Files browser: the file list + filter + selection, the keyboard
 *  reducer, and the files.list/files.open RPCs. Kept out of the controller so
 *  that file stays focused on layout and tab/terminal state. */
export class FileBrowserController {
  private state = emptyFileBrowser()

  constructor(
    private readonly client: RpcClient,
    private readonly deps: FileBrowserDeps
  ) {}

  get current(): FileBrowserState {
    return this.state
  }

  get isOpen(): boolean {
    return this.state.open
  }

  async open(): Promise<void> {
    const worktreeId = this.deps.worktreeId()
    if (!worktreeId) {
      return
    }
    this.state = { open: true, query: '', files: [], index: 0 }
    this.deps.onChange()
    try {
      const { result } = await this.client.call<{ files?: FileEntry[] }>('files.list', {
        worktree: `id:${worktreeId}`
      })
      if (this.state.open) {
        this.state = { ...this.state, files: result.files ?? [] }
        this.deps.onChange()
      }
    } catch {
      // Leave the (empty) browser open; the user can Esc out.
    }
  }

  close(): void {
    this.state = emptyFileBrowser()
    this.deps.onChange()
  }

  handleKey(data: string): void {
    const key = decodeKey(data)
    if (!key) {
      return
    }
    if (key.type === 'escape') {
      this.close()
    } else if (key.type === 'enter') {
      void this.openSelected()
    } else if (key.type === 'up' || key.type === 'down') {
      const index = clampFileIndex({
        ...this.state,
        index: this.state.index + (key.type === 'down' ? 1 : -1)
      })
      this.update({ index })
    } else if (key.type === 'backspace') {
      this.update({ query: this.state.query.slice(0, -1), index: 0 })
    } else if (key.type === 'char') {
      this.update({ query: this.state.query + key.value, index: 0 })
    }
  }

  /** Open the file at a clicked screen row. The list starts 3 rows down (top bar
   *  + panel header + query) and its window is bodyHeight − 2 tall. */
  clickRow(screenRow: number): void {
    const index = fileIndexAtBodyRow(this.state, screenRow - 3, this.deps.bodyHeight() - 2)
    if (index !== null) {
      this.state = { ...this.state, index }
      void this.openSelected()
    }
  }

  private update(patch: Partial<FileBrowserState>): void {
    this.state = { ...this.state, ...patch }
    this.deps.onChange()
  }

  private async openSelected(): Promise<void> {
    const file = selectedFile(this.state)
    const worktreeId = this.deps.worktreeId()
    this.close()
    if (!file || !worktreeId) {
      return
    }
    try {
      await this.client.call('files.open', {
        worktree: `id:${worktreeId}`,
        relativePath: file.relativePath
      })
      this.deps.onOpened(file.relativePath)
    } catch {
      // Open failed; nothing to focus.
    }
  }
}
