import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text, useApp, useInput, useStdin, useStdout } from 'ink'
import type { RunTuiOptions } from './tui-runtime-contract'
import { WorktreeSnapshotSource, type WorktreeSnapshotState } from './worktree-snapshot-source'
import { flattenWorktreeRows, type WorktreeRow, type WorktreeSnapshot } from './worktree-snapshot'
import {
  initialDebounceState,
  reconcileIndicator,
  worktreeIndicatorKind,
  type IndicatorDebounceState,
  type StatusIndicatorKind
} from './agent-state-indicator'
import { WorktreeSidebar } from './worktree-sidebar'
import { TerminalPanes } from './terminal-panes'
import { StatusBar } from './status-bar'
import { HelpOverlay } from './help-overlay'
import { ConfirmOverlay, PromptOverlay } from './tui-overlays'
import { buildSidebarLines, rowIndexAtScreenRow } from './sidebar-lines'
import { MAX_PANES, tabHandleAtColumn, tabRegions, truncateTabLabel } from './pane-layout'
import { resolveTheme } from './theme'
import { currentPlatform, resolveAction } from './keybinding-map'
import { inkKeyToLogical } from './ink-key-bridge'
import { clampSelection, moveSelection } from './navigation-state'
import { MOUSE_DISABLE, MOUSE_ENABLE, parseMouseEvents, type MouseEvent } from './mouse-input'
import { TerminalScreenStream } from './terminal-screen-stream'
import { emptyScreenState, type TerminalScreenState } from './terminal-screen'
import { dispatchAction, worktreeSelector, type TuiCommand } from './action-dispatch'
import type { RuntimeTerminalListResult } from '../../shared/runtime-types'

type Overlay =
  | { kind: 'none' }
  | { kind: 'help' }
  | { kind: 'confirm'; message: string; command: TuiCommand }
  | { kind: 'prompt'; label: string; build: (text: string) => TuiCommand | null }

type TerminalRef = { handle: string; title: string }

function sidebarWidthFor(columns: number): number {
  return Math.max(16, Math.min(34, Math.floor(columns * 0.34)))
}

function padToWidth(label: string, width: number): string {
  if (width <= 0) {
    return label
  }
  return label.length >= width ? label.slice(0, width) : label + ' '.repeat(width - label.length)
}

/** Root TUI: a herdr-style dashboard — worktree sidebar (workspace switcher)
 *  beside a main panel of vertically split terminal panes. */
export function TuiApp({ options }: { options: RunTuiOptions }): React.JSX.Element {
  const { exit } = useApp()
  const { stdin } = useStdin()
  const { stdout } = useStdout()
  const theme = useMemo(() => resolveTheme(), [])
  const platform = currentPlatform()
  const source = useMemo(() => new WorktreeSnapshotSource(options.client), [options.client])

  const [snap, setSnap] = useState<WorktreeSnapshotState>(source.getState())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [terminals, setTerminals] = useState<TerminalRef[]>([])
  const [focusedHandle, setFocusedHandle] = useState<string | null>(null)
  const [screen, setScreen] = useState<TerminalScreenState>(emptyScreenState())
  const [size, setSize] = useState({ columns: stdout?.columns ?? 80, rows: stdout?.rows ?? 24 })

  const rows = useMemo(() => (snap.snapshot ? flattenWorktreeRows(snap.snapshot) : []), [snap])
  const selected = rows[clampSelection(selectedIndex, rows.length)] ?? null
  const selectedWorktreeId = selected?.worktreeId ?? null
  const sidebarWidth = sidebarWidthFor(size.columns)

  const tabSpecs = terminals.map((terminal) => ({
    handle: terminal.handle,
    label: truncateTabLabel(terminal.title)
  }))

  // Refs so the mouse handler reads the latest state without re-subscribing
  // stdin (which would churn MOUSE_ENABLE/DISABLE) on every poll.
  const snapshotRef = useRef<WorktreeSnapshot | null>(snap.snapshot)
  snapshotRef.current = snap.snapshot
  const rowCountRef = useRef(rows.length)
  rowCountRef.current = rows.length
  const sidebarWidthRef = useRef(sidebarWidth)
  sidebarWidthRef.current = sidebarWidth
  const tabSpecsRef = useRef(tabSpecs)
  tabSpecsRef.current = tabSpecs

  // Per-worktree debounce so the sidebar indicators don't strobe between polls.
  const debounceRef = useRef(new Map<string, IndicatorDebounceState>())
  const [publishedKinds, setPublishedKinds] = useState<Map<string, StatusIndicatorKind>>(new Map())

  useEffect(() => {
    if (!snap.snapshot) {
      return
    }
    const next = new Map<string, StatusIndicatorKind>()
    const seen = new Set<string>()
    const now = Date.now()
    for (const row of rows) {
      seen.add(row.worktreeId)
      const raw = worktreeIndicatorKind(row.status, row.agents)
      const prev = debounceRef.current.get(row.worktreeId) ?? initialDebounceState(raw)
      const result = reconcileIndicator(prev, raw, now)
      debounceRef.current.set(row.worktreeId, result.state)
      next.set(row.worktreeId, result.published)
    }
    for (const id of debounceRef.current.keys()) {
      if (!seen.has(id)) {
        debounceRef.current.delete(id)
      }
    }
    setPublishedKinds(next)
  }, [snap, rows])

  const indicatorKindFor = (row: WorktreeRow): StatusIndicatorKind =>
    publishedKinds.get(row.worktreeId) ?? worktreeIndicatorKind(row.status, row.agents)

  useEffect(() => {
    const unsubscribe = source.subscribe(setSnap)
    source.start()
    return () => {
      unsubscribe()
      source.stop()
    }
  }, [source])

  // Track terminal size so the layout is responsive (matters on narrow panes).
  useEffect(() => {
    if (!stdout) {
      return
    }
    const onResize = (): void => setSize({ columns: stdout.columns, rows: stdout.rows })
    onResize()
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  useEffect(() => {
    setSelectedIndex((index) => clampSelection(index, rows.length))
  }, [rows.length])

  // Selected worktree -> list its terminals (one per tab).
  useEffect(() => {
    if (!selectedWorktreeId) {
      setTerminals([])
      setFocusedHandle(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const list = await options.client.call<RuntimeTerminalListResult>('terminal.list', {
          worktree: worktreeSelector(selectedWorktreeId)
        })
        if (cancelled) {
          return
        }
        const refs: TerminalRef[] = list.result.terminals.slice(0, MAX_PANES).map((terminal) => ({
          handle: terminal.handle,
          title: terminal.title && terminal.title.length > 0 ? terminal.title : 'shell'
        }))
        setTerminals(refs)
        setFocusedHandle(refs[0]?.handle ?? null)
      } catch {
        if (!cancelled) {
          setTerminals([])
          setFocusedHandle(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedWorktreeId, options.client])

  // Focused terminal -> stream its colored screen (ANSI snapshot polling).
  useEffect(() => {
    setScreen(emptyScreenState())
    if (!focusedHandle) {
      return
    }
    const stream = new TerminalScreenStream(options.client, focusedHandle)
    const unsubscribe = stream.subscribe(setScreen)
    stream.start()
    return () => {
      unsubscribe()
      stream.stop()
    }
  }, [focusedHandle, options.client])

  // Mouse: enable SGR reporting once per session; keyboard stays the guaranteed
  // path. Latest state is read via refs so deps stay [stdin].
  useEffect(() => {
    if (!stdin || !process.stdout.isTTY) {
      return
    }
    process.stdout.write(MOUSE_ENABLE)
    const handleMouse = (event: MouseEvent): void => {
      if (event.type === 'scroll') {
        setSelectedIndex((index) =>
          moveSelection(index, event.direction === 'down' ? 1 : -1, rowCountRef.current)
        )
        return
      }
      if (event.type !== 'press' || event.button !== 'left') {
        return
      }
      if (event.col < sidebarWidthRef.current) {
        const target = rowIndexAtScreenRow(buildSidebarLines(snapshotRef.current), event.row)
        if (target !== null) {
          setSelectedIndex(target)
        }
        return
      }
      // Main panel: the tab strip is the first content row (just below the app
      // header bar). A click there focuses that terminal's tab.
      const handle = tabHandleAtColumn(
        tabRegions(tabSpecsRef.current, sidebarWidthRef.current + 2),
        event.col
      )
      if (handle) {
        setFocusedHandle(handle)
      }
    }
    const onData = (chunk: Buffer | string): void => {
      for (const event of parseMouseEvents(chunk.toString())) {
        handleMouse(event)
      }
    }
    stdin.on('data', onData)
    return () => {
      stdin.off('data', onData)
      process.stdout.write(MOUSE_DISABLE)
    }
  }, [stdin])

  async function run(command: TuiCommand): Promise<void> {
    const result = await dispatchAction(options.client, command)
    setError(result.ok ? null : result.error)
    if (result.ok) {
      void source.refreshOnce()
    }
  }

  function cycleFocus(): void {
    if (terminals.length === 0) {
      return
    }
    const current = terminals.findIndex((terminal) => terminal.handle === focusedHandle)
    const next = terminals[(current + 1) % terminals.length]
    setFocusedHandle(next.handle)
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
    } else if (action === 'send-input' && focusedHandle) {
      const handle = focusedHandle
      setInput('')
      setOverlay({
        kind: 'prompt',
        label: 'Send to focused terminal:',
        build: (text) => ({ kind: 'terminal.send', terminal: handle, text, enter: true })
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
    if (key.tab) {
      cycleFocus()
      return
    }
    if (logical) {
      startAction(resolveAction(logical))
    }
  })

  const bodyRows = Math.max(3, size.rows - 2)
  const branchLabel = selected ? selected.branch.replace(/^refs\/heads\//, '') : ''
  // Avoid "name · name" when the display name already is the branch.
  const showBranch = branchLabel.length > 0 && branchLabel !== selected?.displayName
  const contextLabel = selected
    ? showBranch
      ? `${selected.displayName} · ${branchLabel}`
      : selected.displayName
    : ''

  return (
    <Box flexDirection="column" width={size.columns} height={size.rows}>
      <Text backgroundColor="cyan" color="black" bold>
        {padToWidth(
          ` orca tui · ${rows.length} worktree${rows.length === 1 ? '' : 's'}`,
          size.columns
        )}
      </Text>
      <Box flexGrow={1}>
        <Box
          width={sidebarWidth}
          flexDirection="column"
          borderStyle="single"
          borderTop={false}
          borderBottom={false}
          borderLeft={false}
        >
          {snap.snapshot ? (
            <WorktreeSidebar
              snapshot={snap.snapshot}
              selectedWorktreeId={selected?.worktreeId ?? null}
              theme={theme}
              indicatorKindFor={indicatorKindFor}
            />
          ) : (
            <Text dimColor>Connecting…</Text>
          )}
        </Box>
        <Box flexGrow={1} flexDirection="column" marginLeft={1}>
          <TerminalPanes
            tabs={terminals}
            focusedHandle={focusedHandle}
            screen={screen}
            availableRows={bodyRows}
          />
        </Box>
      </Box>

      {overlay.kind === 'help' ? <HelpOverlay platform={platform} /> : null}
      {overlay.kind === 'confirm' ? <ConfirmOverlay message={overlay.message} /> : null}
      {overlay.kind === 'prompt' ? <PromptOverlay label={overlay.label} value={input} /> : null}

      <StatusBar
        platform={platform}
        disconnected={!snap.connected}
        error={error}
        context={contextLabel}
      />
    </Box>
  )
}
