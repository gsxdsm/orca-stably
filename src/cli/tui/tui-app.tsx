import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useApp, useInput, useStdin } from 'ink'
import type { RunTuiOptions } from './tui-runtime-contract'
import { WorktreeSnapshotSource, type WorktreeSnapshotState } from './worktree-snapshot-source'
import { flattenWorktreeRows } from './worktree-snapshot'
import { WorktreeSidebar } from './worktree-sidebar'
import { WorktreeDetailPane } from './worktree-detail-pane'
import { StatusBar } from './status-bar'
import { HelpOverlay } from './help-overlay'
import { ConfirmOverlay, PromptOverlay } from './tui-overlays'
import { buildSidebarLines, rowIndexAtScreenRow } from './sidebar-lines'
import { resolveTheme } from './theme'
import { currentPlatform } from './keybinding-map'
import { inkKeyToLogical } from './ink-key-bridge'
import { resolveAction } from './keybinding-map'
import { clampSelection, moveSelection } from './navigation-state'
import { MOUSE_DISABLE, MOUSE_ENABLE, parseMouseEvent } from './mouse-input'
import { TerminalReadTailStream } from './terminal-read-tail-stream'
import type { TerminalTailState } from './terminal-stream'
import { dispatchAction, worktreeSelector, type TuiCommand } from './action-dispatch'
import type { RuntimeTerminalListResult } from '../../shared/runtime-types'

const SIDEBAR_WIDTH = 32

type Overlay =
  | { kind: 'none' }
  | { kind: 'help' }
  | { kind: 'confirm'; message: string; command: TuiCommand }
  | { kind: 'prompt'; label: string; build: (text: string) => TuiCommand | null }

/** Root TUI component: live worktree dashboard with keyboard + mouse control. */
export function TuiApp({ options }: { options: RunTuiOptions }): React.JSX.Element {
  const { exit } = useApp()
  const { stdin } = useStdin()
  const theme = useMemo(() => resolveTheme(), [])
  const platform = currentPlatform()
  const source = useMemo(() => new WorktreeSnapshotSource(options.client), [options.client])

  const [snap, setSnap] = useState<WorktreeSnapshotState>(source.getState())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tail, setTail] = useState<TerminalTailState | null>(null)

  const rows = useMemo(() => (snap.snapshot ? flattenWorktreeRows(snap.snapshot) : []), [snap])
  const selected = rows[clampSelection(selectedIndex, rows.length)] ?? null
  const selectedWorktreeId = selected?.worktreeId ?? null

  useEffect(() => {
    const unsubscribe = source.subscribe(setSnap)
    source.start()
    return () => {
      unsubscribe()
      source.stop()
    }
  }, [source])

  useEffect(() => {
    setSelectedIndex((index) => clampSelection(index, rows.length))
  }, [rows.length])

  // Resolve a terminal for the selected worktree and tail it. Keyed on the
  // worktree id (stable across snapshot refreshes) rather than the row object.
  useEffect(() => {
    if (!selectedWorktreeId) {
      setTail(null)
      return
    }
    let stream: TerminalReadTailStream | null = null
    let cancelled = false
    void (async () => {
      try {
        const list = await options.client.call<RuntimeTerminalListResult>('terminal.list', {
          worktree: worktreeSelector(selectedWorktreeId)
        })
        const handle = list.result.terminals[0]?.handle
        if (cancelled || !handle) {
          setTail(null)
          return
        }
        stream = new TerminalReadTailStream(options.client, handle, { isRemote: options.isRemote })
        stream.subscribe(setTail)
        stream.start()
      } catch {
        if (!cancelled) {
          setTail(null)
        }
      }
    })()
    return () => {
      cancelled = true
      stream?.stop()
    }
  }, [selectedWorktreeId, options.client, options.isRemote])

  // Mouse: enable SGR reporting on mount, restore on unmount. Keyboard remains
  // the guaranteed path, so a terminal without mouse support still works.
  useEffect(() => {
    if (!stdin || !process.stdout.isTTY) {
      return
    }
    process.stdout.write(MOUSE_ENABLE)
    const onData = (chunk: Buffer | string): void => {
      const event = parseMouseEvent(chunk.toString())
      if (!event) {
        return
      }
      if (event.type === 'scroll') {
        setSelectedIndex((index) =>
          moveSelection(index, event.direction === 'down' ? 1 : -1, rows.length)
        )
        return
      }
      if (event.type === 'press' && event.button === 'left' && event.col < SIDEBAR_WIDTH) {
        const target = rowIndexAtScreenRow(buildSidebarLines(snap.snapshot), event.row)
        if (target !== null) {
          setSelectedIndex(target)
        }
      }
    }
    stdin.on('data', onData)
    return () => {
      stdin.off('data', onData)
      process.stdout.write(MOUSE_DISABLE)
    }
  }, [stdin, rows.length, snap.snapshot])

  async function run(command: TuiCommand): Promise<void> {
    const result = await dispatchAction(options.client, command)
    setError(result.ok ? null : result.error)
    if (result.ok) {
      void source.refreshOnce()
    }
  }

  function startAction(action: ReturnType<typeof resolveAction>): void {
    if (!action) {
      return
    }
    if (action === 'quit') {
      exit()
    } else if (action === 'help') {
      setOverlay({ kind: 'help' })
    } else if (action === 'refresh') {
      void source.refreshOnce()
    } else if (action === 'move-up') {
      setSelectedIndex((index) => moveSelection(index, -1, rows.length))
    } else if (action === 'move-down') {
      setSelectedIndex((index) => moveSelection(index, 1, rows.length))
    } else if (selected) {
      startTargetedAction(action)
    }
  }

  function startTargetedAction(action: NonNullable<ReturnType<typeof resolveAction>>): void {
    if (!selected) {
      return
    }
    const wt = worktreeSelector(selected.worktreeId)
    if (action === 'activate') {
      void run({ kind: 'worktree.activate', worktree: wt })
    } else if (action === 'remove-worktree') {
      setOverlay({
        kind: 'confirm',
        message: `Remove worktree "${selected.displayName}"?`,
        command: { kind: 'worktree.rm', worktree: wt, force: true }
      })
    } else if (action === 'new-terminal') {
      setInput('')
      setOverlay({
        kind: 'prompt',
        label: 'New terminal command (blank for a shell):',
        build: (text) => ({ kind: 'terminal.create', worktree: wt, command: text || undefined })
      })
    } else if (action === 'new-worktree') {
      setInput('')
      setOverlay({
        kind: 'prompt',
        label: `New worktree name (repo ${selected.repoId}):`,
        build: (text) =>
          text ? { kind: 'worktree.create', repo: `id:${selected.repoId}`, name: text } : null
      })
    } else if (action === 'send-input' && tail) {
      setInput('')
      setOverlay({
        kind: 'prompt',
        label: 'Send to terminal:',
        build: (text) => ({ kind: 'terminal.send', terminal: tail.handle, text, enter: true })
      })
    }
  }

  useInput((value, key) => {
    const logical = inkKeyToLogical(value, key)
    if (overlay.kind === 'help') {
      setOverlay({ kind: 'none' })
      return
    }
    if (overlay.kind === 'confirm') {
      if (value === 'y') {
        void run(overlay.command)
        setOverlay({ kind: 'none' })
      } else if (value === 'n' || key.escape) {
        setOverlay({ kind: 'none' })
      }
      return
    }
    if (overlay.kind === 'prompt') {
      if (key.return) {
        const command = overlay.build(input)
        setOverlay({ kind: 'none' })
        if (command) {
          void run(command)
        }
      } else if (key.escape) {
        setOverlay({ kind: 'none' })
      } else if (key.backspace || key.delete) {
        setInput((current) => current.slice(0, -1))
      } else if (logical?.type === 'char') {
        setInput((current) => current + logical.value)
      }
      return
    }
    if (logical) {
      startAction(resolveAction(logical))
    }
  })

  return (
    <Box flexDirection="column">
      <Box>
        <Box width={SIDEBAR_WIDTH} flexDirection="column">
          {snap.snapshot ? (
            <WorktreeSidebar
              snapshot={snap.snapshot}
              selectedWorktreeId={selected?.worktreeId ?? null}
              theme={theme}
            />
          ) : (
            <Text dimColor>Connecting…</Text>
          )}
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <WorktreeDetailPane row={selected} tail={tail} />
        </Box>
      </Box>

      {overlay.kind === 'help' ? <HelpOverlay platform={platform} /> : null}
      {overlay.kind === 'confirm' ? <ConfirmOverlay message={overlay.message} /> : null}
      {overlay.kind === 'prompt' ? <PromptOverlay label={overlay.label} value={input} /> : null}

      <StatusBar platform={platform} disconnected={!snap.connected} error={error} />
    </Box>
  )
}
