import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeAccountsSnapshot } from '../accounts/accounts-snapshot'
import {
  COMPOSER_USAGE_WINDOW_KEY,
  setComposerUsageWindow,
  useComposerUsageWindow
} from '../composer-usage/composer-usage-window-preference'
import {
  LIVE_PAGE_STORAGE_KEYS,
  TERMINAL_SETTINGS_STORAGE_KEYS
} from '../mobile-web-shell/page-storage/page-storage-keys'
import { writeMirroredStorage } from '../storage/mirrored-storage-keys'
import { listRailUsage, pickRailUsageWindow } from './rail-usage-model'

const storage = vi.hoisted(() => new Map<string, string>())
const shellStorageRef = vi.hoisted(() => ({
  current: null as Readonly<Record<string, string>> | null
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: async (key: string) => {
      storage.delete(key)
    },
    multiGet: async (keys: readonly string[]) => keys.map((key) => [key, storage.get(key) ?? null])
  }
}))

vi.mock('../platform/shell-storage/shell-storage', () => ({
  useShellStorage: () => shellStorageRef.current
}))

const NOW = Date.parse('2026-11-27T05:00:00Z')
const RESET_5H = NOW + 3 * 60 * 60_000 + 15 * 60_000
const RESET_WEEKLY = NOW + 5 * 24 * 60 * 60_000

const win = (usedPercent: number, windowMinutes: number, resetsAt: number | null) => ({
  usedPercent,
  windowMinutes,
  resetsAt,
  resetDescription: null
})

const providerLimits = (provider: string, extra: Record<string, unknown>) => ({
  provider,
  session: null,
  weekly: null,
  updatedAt: NOW,
  error: null,
  status: 'ok',
  ...extra
})

let tree: ReactTestRenderer | undefined

afterEach(() => {
  storage.clear()
  shellStorageRef.current = null
  act(() => {
    setComposerUsageWindow('session')
    tree?.unmount()
  })
  tree = undefined
})

describe('rail usage window selection', () => {
  const snapshot = decodeAccountsSnapshot({
    claude: { accounts: [], activeAccountId: null },
    codex: { accounts: [], activeAccountId: null },
    rateLimits: {
      claude: providerLimits('claude', {
        session: win(22, 300, RESET_5H),
        weekly: win(71, 10_080, RESET_WEEKLY)
      }),
      codex: providerLimits('codex', {
        session: win(0, 300, null),
        weekly: win(44, 10_080, RESET_WEEKLY)
      }),
      antigravity: providerLimits('antigravity', {
        session: win(35, 300, RESET_5H),
        weekly: win(48, 10_080, RESET_WEEKLY)
      }),
      grok: providerLimits('grok', {
        weekly: win(62, 10_080, RESET_WEEKLY)
      }),
      muse: providerLimits('muse', {
        session: win(18, 300, RESET_5H)
      }),
      inactiveClaudeAccounts: [],
      inactiveCodexAccounts: []
    }
  })

  it('applies the 5-hour vs weekly choice consistently across every provider ring with clean fallbacks', () => {
    const byProvider = new Map(listRailUsage(snapshot).map((entry) => [entry.provider, entry]))

    // 5-hour selected: Claude, Codex (even at 0% / no reset), Antigravity, Muse show 5h; Grok falls back to weekly.
    expect(pickRailUsageWindow(byProvider.get('claude')!.windows, 'session')).toMatchObject({
      kind: 'session',
      window: { usedPercent: 22, resetsAt: RESET_5H }
    })
    expect(pickRailUsageWindow(byProvider.get('codex')!.windows, 'session')).toMatchObject({
      kind: 'session',
      window: { usedPercent: 0, resetsAt: null }
    })
    expect(pickRailUsageWindow(byProvider.get('antigravity')!.windows, 'session')).toMatchObject({
      kind: 'session',
      window: { usedPercent: 35, resetsAt: RESET_5H }
    })
    expect(pickRailUsageWindow(byProvider.get('grok')!.windows, 'session')).toMatchObject({
      kind: 'weekly',
      window: { usedPercent: 62, resetsAt: RESET_WEEKLY }
    })
    expect(pickRailUsageWindow(byProvider.get('muse')!.windows, 'session')).toMatchObject({
      kind: 'session',
      window: { usedPercent: 18, resetsAt: RESET_5H }
    })

    // Weekly selected: Claude, Codex, Antigravity, Grok show weekly; Muse falls back to 5h.
    expect(pickRailUsageWindow(byProvider.get('claude')!.windows, 'weekly')).toMatchObject({
      kind: 'weekly',
      window: { usedPercent: 71, resetsAt: RESET_WEEKLY }
    })
    expect(pickRailUsageWindow(byProvider.get('codex')!.windows, 'weekly')).toMatchObject({
      kind: 'weekly',
      window: { usedPercent: 44, resetsAt: RESET_WEEKLY }
    })
    expect(pickRailUsageWindow(byProvider.get('antigravity')!.windows, 'weekly')).toMatchObject({
      kind: 'weekly',
      window: { usedPercent: 48, resetsAt: RESET_WEEKLY }
    })
    expect(pickRailUsageWindow(byProvider.get('grok')!.windows, 'weekly')).toMatchObject({
      kind: 'weekly',
      window: { usedPercent: 62, resetsAt: RESET_WEEKLY }
    })
    expect(pickRailUsageWindow(byProvider.get('muse')!.windows, 'weekly')).toMatchObject({
      kind: 'session',
      window: { usedPercent: 18, resetsAt: RESET_5H }
    })
  })
})

describe('usage window toggle reactivity across native shell and web page', () => {
  it('propagates live toggles in-process, from page writes into native rings, and from shell storage into open pages', async () => {
    const seen: string[] = []
    function Probe() {
      seen.push(useComposerUsageWindow())
      return null
    }

    await act(async () => {
      tree = create(createElement(Probe))
      await Promise.resolve()
    })
    expect(seen.at(-1)).toBe('session')

    // Direct toggle updates subscribers immediately.
    await act(async () => {
      setComposerUsageWindow('weekly')
      await Promise.resolve()
    })
    expect(seen.at(-1)).toBe('weekly')

    // A WebView page write mirrored into native storage updates native rail readers immediately.
    await act(async () => {
      writeMirroredStorage(COMPOSER_USAGE_WINDOW_KEY, 'session')
      await Promise.resolve()
    })
    expect(seen.at(-1)).toBe('session')

    // A shell storage refresh inside a WebView page rereads storage and updates composer readers immediately.
    storage.set(COMPOSER_USAGE_WINDOW_KEY, 'weekly')
    shellStorageRef.current = { [COMPOSER_USAGE_WINDOW_KEY]: 'weekly' }
    await act(async () => {
      tree!.update(createElement(Probe))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(seen.at(-1)).toBe('weekly')
  })

  it('includes composer & rail usage preference keys in live page storage sync', () => {
    for (const key of [
      'orca:composerUsageWindow',
      'orca:composerUsageDisplay',
      'orca:composerUsagePosition'
    ] as const) {
      expect(TERMINAL_SETTINGS_STORAGE_KEYS).toContain(key)
      expect(LIVE_PAGE_STORAGE_KEYS).toContain(key)
    }
  })
})
