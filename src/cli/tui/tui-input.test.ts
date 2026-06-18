import { describe, expect, it, vi } from 'vitest'
import { handleKey, handleMouse, type ControllerHost, type ControllerOverlay } from './tui-input'
import { buildWorktreeSnapshot, flattenWorktreeRows } from './worktree-snapshot'
import { worktreeIndicatorKind } from './agent-state-indicator'
import { makePsResult, makeWorktreeSummary } from './worktree-snapshot-fixtures'
import type { MouseEvent } from './mouse-input'
import type { LogicalKey } from './tty-key-adapter'

const snapshot = buildWorktreeSnapshot(
  makePsResult([makeWorktreeSummary({ worktreeId: 'wt-1', isActive: true, liveTerminalCount: 1 })])
)
const rows = flattenWorktreeRows(snapshot)

function makeHost(overrides: Partial<ControllerHost> = {}): ControllerHost {
  let overlay: ControllerOverlay = { kind: 'none' }
  return {
    worktreeRows: () => rows,
    selected: () => rows[0] ?? null,
    selectedIndex: () => 0,
    isNarrow: () => false,
    narrowView: () => 'list',
    sidebarWidth: () => 30,
    bodyHeight: () => 20,
    snapshot: () => snapshot,
    resolveKind: (row) => worktreeIndicatorKind(row.status, row.agents),
    terminals: () => [{ handle: 't1', title: 'shell' }],
    focusedHandle: () => 't1',
    overlay: () => overlay,
    inputValue: () => '',
    terminalFocused: () => false,
    selectIndex: vi.fn(),
    move: vi.fn(),
    setNarrowView: vi.fn(),
    setFocused: vi.fn(),
    cycleFocus: vi.fn(),
    focusTerminal: vi.fn(),
    exitTerminalFocus: vi.fn(),
    scrollTerminal: vi.fn(),
    setOverlay: vi.fn((next: ControllerOverlay) => {
      overlay = next
    }),
    setInput: vi.fn(),
    runCommand: vi.fn(),
    refresh: vi.fn(),
    quit: vi.fn(),
    ...overrides
  }
}

const key = (k: LogicalKey): LogicalKey => k

describe('handleKey', () => {
  it('routes arrow/jk navigation to move', () => {
    const host = makeHost()
    handleKey(host, key({ type: 'down' }))
    expect(host.move).toHaveBeenCalledWith(1)
  })

  it('quits on q', () => {
    const host = makeHost()
    handleKey(host, key({ type: 'char', value: 'q' }))
    expect(host.quit).toHaveBeenCalled()
  })

  it('opens help and closes it on the next key', () => {
    const host = makeHost()
    handleKey(host, key({ type: 'char', value: '?' }))
    expect(host.setOverlay).toHaveBeenCalledWith({ kind: 'help' })
    handleKey(host, key({ type: 'char', value: 'x' }))
    expect(host.setOverlay).toHaveBeenLastCalledWith({ kind: 'none' })
  })

  it('cycles terminal focus on tab', () => {
    const host = makeHost()
    handleKey(host, key({ type: 'tab' }))
    expect(host.cycleFocus).toHaveBeenCalled()
  })

  it('focuses the terminal for input on Enter (wide)', () => {
    const host = makeHost()
    handleKey(host, key({ type: 'enter' }))
    expect(host.focusTerminal).toHaveBeenCalled()
  })

  it('opens a prompt for new-worktree and submits a built command', () => {
    const host = makeHost({ inputValue: () => 'feature-y' })
    handleKey(host, key({ type: 'char', value: 'n' }))
    const call = (host.setOverlay as ReturnType<typeof vi.fn>).mock.calls.find(
      ([o]) => o.kind === 'prompt'
    )
    expect(call).toBeTruthy()
    const overlay = call?.[0] as Extract<ControllerOverlay, { kind: 'prompt' }>
    handleKey(host, key({ type: 'enter' }))
    expect(overlay.build('feature-y')).toMatchObject({ kind: 'worktree.create', name: 'feature-y' })
  })

  it('runs the command on a confirm-y', () => {
    const command = { kind: 'worktree.rm', worktree: 'id:wt-1', force: true } as const
    const host = makeHost({ overlay: () => ({ kind: 'confirm', message: 'Remove?', command }) })
    handleKey(host, key({ type: 'char', value: 'y' }))
    expect(host.runCommand).toHaveBeenCalledWith(command)
  })
})

const press = (col: number, row: number): MouseEvent => ({
  type: 'press',
  button: 'left',
  col,
  row
})

describe('handleMouse', () => {
  it('scrolls the selection when the terminal is not focused', () => {
    const host = makeHost()
    handleMouse(host, { type: 'scroll', direction: 'down', col: 0, row: 0 })
    expect(host.move).toHaveBeenCalledWith(1)
    expect(host.scrollTerminal).not.toHaveBeenCalled()
  })

  it('scrolls terminal history (up = older) when the terminal is focused', () => {
    const host = makeHost({ terminalFocused: () => true })
    handleMouse(host, { type: 'scroll', direction: 'up', col: 0, row: 0 })
    expect(host.scrollTerminal).toHaveBeenCalledWith(3)
    expect(host.move).not.toHaveBeenCalled()
  })

  it('focuses the terminal when the viewport body is clicked (wide)', () => {
    const host = makeHost()
    handleMouse(host, press(60, 10))
    expect(host.focusTerminal).toHaveBeenCalled()
  })

  it('focuses the selected workspace terminal when a sidebar row is clicked', () => {
    const host = makeHost()
    handleMouse(host, press(2, 4))
    expect(host.selectIndex).toHaveBeenCalledWith(0)
    expect(host.focusTerminal).toHaveBeenCalled()
  })

  it('selects a worktree when the sidebar is clicked', () => {
    const host = makeHost()
    // lines: header(0) spacer(1) group(2) row(3) → screenRow 4 maps to row index 0.
    handleMouse(host, press(2, 4))
    expect(host.selectIndex).toHaveBeenCalledWith(0)
  })

  it('focuses a tab when the tab row is clicked', () => {
    const host = makeHost()
    // Tab strip starts at sidebarWidth + 2 = 32; first tab " shell " spans it.
    handleMouse(host, press(34, 1))
    expect(host.setFocused).toHaveBeenCalledWith('t1')
  })

  it('opens the terminal view when a narrow list row is clicked', () => {
    const host = makeHost({ isNarrow: () => true, narrowView: () => 'list' })
    handleMouse(host, press(0, 4))
    expect(host.selectIndex).toHaveBeenCalledWith(0)
    expect(host.setNarrowView).toHaveBeenCalledWith('terminal')
  })
})
