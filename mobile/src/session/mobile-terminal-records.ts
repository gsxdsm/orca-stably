import type { MobileTerminalTheme } from '../terminal/TerminalWebView'

export type MobileTerminalThemeVariants = {
  dark: MobileTerminalTheme
  light: MobileTerminalTheme
}

export type TerminalRecord = {
  handle: string
  title: string
  terminalTheme?: MobileTerminalTheme
  terminalThemeVariants?: MobileTerminalThemeVariants
  isActive: boolean
}

export type MobileTerminalSessionTab = {
  type: 'terminal'
  id: string
  title: string
  parentTabId?: string
  leafId?: string
  status?: 'pending-handle' | 'ready'
  terminal: string | null
  terminalTheme?: MobileTerminalTheme
  terminalThemeVariants?: MobileTerminalThemeVariants
  isActive: boolean
}

type MobileSessionTabLike =
  | MobileTerminalSessionTab
  | {
      type: string
      title?: string
      terminal?: unknown
      terminalTheme?: MobileTerminalTheme
      terminalThemeVariants?: MobileTerminalThemeVariants
      isActive?: boolean
    }

// Why: the host's resolved terminalTheme follows the DESKTOP appearance; when
// the host also sends forced-mode variants, prefer the one matching the
// phone's scheme so the terminal follows the phone. Older hosts omit variants.
export function resolveTerminalThemeForScheme(
  record: Pick<TerminalRecord, 'terminalTheme' | 'terminalThemeVariants'>,
  scheme: 'light' | 'dark'
): MobileTerminalTheme | undefined {
  return record.terminalThemeVariants?.[scheme] ?? record.terminalTheme
}

export function mergeTerminalRecordsByCurrentOrder(
  terminalTabs: TerminalRecord[],
  currentTerminals: TerminalRecord[]
): TerminalRecord[] {
  if (currentTerminals.length === 0) {
    return terminalTabs
  }
  const terminalTabsByHandle = new Map(terminalTabs.map((tab) => [tab.handle, tab]))
  const currentHandles = new Set(currentTerminals.map((terminal) => terminal.handle))
  return [
    ...currentTerminals.map((terminal) => terminalTabsByHandle.get(terminal.handle) ?? terminal),
    ...terminalTabs.filter((terminal) => !currentHandles.has(terminal.handle))
  ]
}

export function getTerminalRecordsFromSessionTabs(
  tabs: readonly MobileSessionTabLike[]
): TerminalRecord[] {
  return tabs.flatMap((tab): TerminalRecord[] => {
    if (tab.type !== 'terminal' || typeof tab.terminal !== 'string') {
      return []
    }
    return [
      {
        handle: tab.terminal,
        title: tab.title || 'Terminal',
        terminalTheme: tab.terminalTheme,
        terminalThemeVariants: tab.terminalThemeVariants,
        isActive: tab.isActive === true
      }
    ]
  })
}

export function mergeTerminalListWithKnownRecords(
  terminalList: TerminalRecord[],
  currentTerminals: TerminalRecord[],
  sessionTabs: readonly MobileSessionTabLike[]
): TerminalRecord[] {
  const currentTerminalsByHandle = new Map(
    currentTerminals.map((terminal) => [terminal.handle, terminal])
  )
  const sessionTerminalsByHandle = new Map(
    getTerminalRecordsFromSessionTabs(sessionTabs).map((terminal) => [terminal.handle, terminal])
  )
  return terminalList.map((terminal) => {
    const sessionTerminal = sessionTerminalsByHandle.get(terminal.handle)
    const currentTerminal = currentTerminalsByHandle.get(terminal.handle)
    // Why: terminal.list summaries can omit the mobile theme; keep the richer
    // session-tab/current record so polling cannot reset TerminalWebView.
    return {
      ...terminal,
      terminalTheme:
        sessionTerminal?.terminalTheme ?? currentTerminal?.terminalTheme ?? terminal.terminalTheme,
      terminalThemeVariants:
        sessionTerminal?.terminalThemeVariants ??
        currentTerminal?.terminalThemeVariants ??
        terminal.terminalThemeVariants
    }
  })
}

export function terminalRecordsEqual(
  a: readonly TerminalRecord[],
  b: readonly TerminalRecord[]
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (terminal, index) =>
        terminal.handle === b[index]?.handle &&
        terminal.title === b[index]?.title &&
        JSON.stringify(terminal.terminalTheme ?? null) ===
          JSON.stringify(b[index]?.terminalTheme ?? null) &&
        JSON.stringify(terminal.terminalThemeVariants ?? null) ===
          JSON.stringify(b[index]?.terminalThemeVariants ?? null) &&
        terminal.isActive === b[index]?.isActive
    )
  )
}
