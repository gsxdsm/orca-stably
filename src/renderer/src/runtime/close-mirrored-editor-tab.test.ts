import { beforeEach, describe, expect, it, vi } from 'vitest'

const closeWebRuntimeSessionTabMock = vi.fn()
const isWebRuntimeSessionActiveMock = vi.fn()

vi.mock('./web-runtime-session', () => ({
  closeWebRuntimeSessionTab: (args: unknown) => closeWebRuntimeSessionTabMock(args),
  isWebRuntimeSessionActive: (id: unknown) => isWebRuntimeSessionActiveMock(id)
}))

vi.mock('@/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: () => 'env-1'
}))

import {
  notifyHostOfMirroredEditorClose,
  type MirroredEditorCloseState
} from './close-mirrored-editor-tab'

function buildState(overrides: Partial<MirroredEditorCloseState> = {}): MirroredEditorCloseState {
  return {
    openFiles: [{ id: 'file-1', worktreeId: 'wt-1', mirroredFromRuntimeSession: true }],
    unifiedTabsByWorktree: {
      'wt-1': [{ id: 'host-tab-1', entityId: 'file-1', contentType: 'editor' }]
    },
    ...overrides
  } as unknown as MirroredEditorCloseState
}

describe('notifyHostOfMirroredEditorClose', () => {
  beforeEach(() => {
    closeWebRuntimeSessionTabMock.mockReset()
    isWebRuntimeSessionActiveMock.mockReset()
    isWebRuntimeSessionActiveMock.mockReturnValue(true)
  })

  it('closes the mirrored editor tab on the host using the host tab id', () => {
    const handled = notifyHostOfMirroredEditorClose(buildState(), 'wt-1', 'file-1')

    expect(handled).toBe(true)
    expect(closeWebRuntimeSessionTabMock).toHaveBeenCalledWith({
      worktreeId: 'wt-1',
      tabId: 'host-tab-1',
      environmentId: 'env-1'
    })
  })

  it('does not route locally-opened (non-mirrored) files to the host', () => {
    const state = buildState({
      openFiles: [
        { id: 'file-1', worktreeId: 'wt-1' }
      ] as unknown as MirroredEditorCloseState['openFiles']
    })

    const handled = notifyHostOfMirroredEditorClose(state, 'wt-1', 'file-1')

    expect(handled).toBe(false)
    expect(closeWebRuntimeSessionTabMock).not.toHaveBeenCalled()
  })

  it('does nothing when no web runtime session is active', () => {
    isWebRuntimeSessionActiveMock.mockReturnValue(false)

    const handled = notifyHostOfMirroredEditorClose(buildState(), 'wt-1', 'file-1')

    expect(handled).toBe(false)
    expect(closeWebRuntimeSessionTabMock).not.toHaveBeenCalled()
  })
})
