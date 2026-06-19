// Persisted install/activation state for plugins — the host's source of truth
// (authority lives in main; renderer/mobile rebuild from this). Injectable
// state-file path so it unit-tests against a temp dir with no Electron.
//
// Activation state is not a secret, so it is written as plain JSON; secret-
// bearing stores (plugin settings that may hold tokens) use the secure-file /
// Windows-ACL path in a later unit.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Where a plugin came from. v1a ships local-folder install; registry/git/
// tarball sources extend this union in a later increment.
export type PluginInstallSource = { kind: 'local'; path: string }

export type PluginStateEntry = {
  id: string
  version: string
  source: PluginInstallSource
  active: boolean
  installedAt: string
}

type PersistedState = { version: 1; plugins: Record<string, PluginStateEntry> }

const EMPTY_STATE: PersistedState = { version: 1, plugins: {} }

export class PluginStore {
  private state: PersistedState

  constructor(private readonly stateFilePath: string) {
    this.state = this.load()
  }

  private load(): PersistedState {
    try {
      if (!existsSync(this.stateFilePath)) {
        return { version: 1, plugins: {} }
      }
      const parsed: unknown = JSON.parse(readFileSync(this.stateFilePath, 'utf8'))
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as PersistedState).plugins === 'object'
      ) {
        return { version: 1, plugins: { ...(parsed as PersistedState).plugins } }
      }
    } catch {
      // Corrupt/unreadable state resets to empty rather than crashing the host.
    }
    return { version: 1, plugins: {} }
  }

  private persist(): void {
    mkdirSync(dirname(this.stateFilePath), { recursive: true })
    writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf8')
  }

  list(): PluginStateEntry[] {
    return Object.values(this.state.plugins)
  }

  get(id: string): PluginStateEntry | undefined {
    return this.state.plugins[id]
  }

  // Record (or refresh) an installed plugin. A reinstall preserves the prior
  // active flag; a first install lands inactive.
  recordInstalled(
    entry: Omit<PluginStateEntry, 'active' | 'installedAt'> & { installedAt?: string }
  ): PluginStateEntry {
    const prior = this.state.plugins[entry.id]
    const stored: PluginStateEntry = {
      id: entry.id,
      version: entry.version,
      source: entry.source,
      active: prior?.active ?? false,
      installedAt: prior?.installedAt ?? entry.installedAt ?? new Date().toISOString()
    }
    this.state.plugins[entry.id] = stored
    this.persist()
    return stored
  }

  // Idempotent: returns true when the active flag actually changed.
  setActive(id: string, active: boolean): boolean {
    const entry = this.state.plugins[id]
    if (!entry || entry.active === active) {
      return false
    }
    entry.active = active
    this.persist()
    return true
  }

  remove(id: string): boolean {
    if (!this.state.plugins[id]) {
      return false
    }
    delete this.state.plugins[id]
    this.persist()
    return true
  }
}

export { EMPTY_STATE }
