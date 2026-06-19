// NEEDS-RUNTIME-VERIFY: the main-process composition root for the plugin
// system. Builds the manager + runtime against Electron paths, wires the host
// command implementations (open-external-url / copy-to-clipboard), the asset
// protocol, and multi-source install (installFromSource + lockfile). Unit-tested
// pieces (manager, runtime, gate, handler, installer) are composed here; this
// glue runs only in the app.
//
// The boot wiring this enables is now in place: index.ts calls
// registerPluginScheme() before app.whenReady(), then createPluginSystem() +
// registerAssetProtocol() + registerPluginHandlers() on ready; the
// plugin-host-entry build target is in electron.vite.config; and the preload
// exposes window.api.plugins. What remains is mobile/relay (v1c) and launching
// the app to verify runtime behavior.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, clipboard, shell } from 'electron'
import { PluginManager } from './plugin-manager'
import { PluginRuntime } from './plugin-runtime'
import { registerPluginAssetProtocol } from './plugin-asset-protocol'
import { readManifestRaw } from './plugin-discovery'
import { validatePluginManifest } from '../../shared/plugin/manifest-validate'
import { parseInstallSource } from './install/install-source'
import { resolveAndInstall } from './install/install-resolver'
import { createInstallAdapters } from './install/install-adapters'
import { emptyLockfile, type PluginLockfile } from './install/install-integrity'
import type { HostCommand, WorkspaceSnapshot } from '../../shared/plugin/api-contract'
import type { OutputLine } from './plugin-output-buffer'

// What the renderer needs to render a plugin's activity-bar tab + list row.
export type RendererPluginEntry = {
  id: string
  version: string
  active: boolean
  title: string
  // Lucide icon name from the manifest (falls back to a default in the UI).
  icon: string
}

export type WorkspaceSnapshotProvider = () => WorkspaceSnapshot | Promise<WorkspaceSnapshot>

export type PluginSystemDeps = {
  // Supplies the bounded workspace snapshot for read:workspace. Injected so the
  // system stays decoupled from the rest of main; defaults to an empty snapshot.
  getWorkspaceSnapshot?: WorkspaceSnapshotProvider
  // Routes a backend's UI message to the plugin's webview in the renderer.
  onUiMessage?: (pluginId: string, message: unknown) => void
}

const EMPTY_SNAPSHOT: WorkspaceSnapshot = {
  workspaceName: '',
  currentBranch: null,
  isDirty: false,
  openFileCount: 0
}

// Resolve the built plugin-host-entry, mirroring sidecar-client's asar.unpacked
// handling (ELECTRON_RUN_AS_NODE bypasses asar require integration).
function resolveEntryPath(): string {
  const appPath = app.getAppPath()
  const base = app.isPackaged ? appPath.replace('app.asar', 'app.asar.unpacked') : appPath
  return join(base, 'out', 'main', 'plugin-host-entry.js')
}

export class PluginSystem {
  readonly manager: PluginManager
  readonly runtime: PluginRuntime
  private readonly pluginsDir: string
  private readonly lockfilePath: string
  private readonly stagingDir: string

  constructor(deps: PluginSystemDeps = {}) {
    this.pluginsDir = join(app.getPath('userData'), 'plugins')
    this.lockfilePath = join(app.getPath('userData'), 'plugins-lock.json')
    this.stagingDir = join(app.getPath('userData'), 'plugins-staging')
    this.manager = new PluginManager({
      pluginsDir: this.pluginsDir,
      stateFilePath: join(app.getPath('userData'), 'plugins-state.json')
    })
    this.runtime = new PluginRuntime({
      manager: this.manager,
      pluginsDir: this.pluginsDir,
      entryPath: resolveEntryPath(),
      forkEnv: { ELECTRON_RUN_AS_NODE: '1' },
      getWorkspaceSnapshot: deps.getWorkspaceSnapshot ?? (() => EMPTY_SNAPSHOT),
      invokeCommand: (name, params) => this.invokeCommand(name, params),
      onUiMessage: deps.onUiMessage
    })
  }

  // Serve plugin assets; call after app.whenReady() (the scheme itself must be
  // registered as privileged before ready — see registerPluginScheme()).
  registerAssetProtocol(): void {
    registerPluginAssetProtocol(this.pluginsDir, (id) => this.runtime.isRunning(id))
  }

  private loadLockfile(): PluginLockfile {
    try {
      if (existsSync(this.lockfilePath)) {
        const parsed = JSON.parse(readFileSync(this.lockfilePath, 'utf8')) as PluginLockfile
        if (parsed?.plugins && typeof parsed.plugins === 'object') {
          return { version: 1, plugins: parsed.plugins }
        }
      }
    } catch {
      // Corrupt lockfile resets; reinstall re-pins integrity.
    }
    return emptyLockfile()
  }

  private saveLockfile(lockfile: PluginLockfile): void {
    writeFileSync(this.lockfilePath, JSON.stringify(lockfile, null, 2), 'utf8')
  }

  // Install from any source string (local path / registry name / git / tarball),
  // pin it in the lockfile, and record it in the manager (inactive).
  async installFromSource(input: string): Promise<{ ok: boolean; id?: string; errors?: string[] }> {
    const source = parseInstallSource(input)
    if (!source) {
      return { ok: false, errors: ['empty install source'] }
    }
    const result = await resolveAndInstall(source, {
      pluginsDir: this.pluginsDir,
      stagingDir: this.stagingDir,
      adapters: createInstallAdapters(),
      lockfile: this.loadLockfile()
    })
    if (!result.ok) {
      return { ok: false, errors: result.errors }
    }
    this.saveLockfile(result.lockfile)
    this.manager.recordInstalled({ id: result.id, version: result.version, source })
    return { ok: true, id: result.id }
  }

  // Enrich each installed plugin's state with its manifest title/icon so the
  // renderer can build activity-bar tabs without a second round-trip.
  list(): RendererPluginEntry[] {
    return this.manager.list().map((entry) => {
      const validated = validatePluginManifest(readManifestRaw(join(this.pluginsDir, entry.id)))
      const sidebar = validated.ok ? validated.manifest.contributes.sidebar : undefined
      return {
        id: entry.id,
        version: entry.version,
        active: entry.active,
        title: sidebar?.title ?? entry.id,
        icon: sidebar?.icon ?? 'Plug'
      }
    })
  }

  getOutput(pluginId: string): OutputLine[] {
    return this.runtime.getOutput(pluginId)
  }

  // The allowlisted host commands (the gate already validated name + params).
  private async invokeCommand(name: HostCommand, params: unknown): Promise<unknown> {
    const args = (params ?? {}) as { url?: string; text?: string }
    switch (name) {
      case 'open-external-url':
        await shell.openExternal(String(args.url))
        return undefined
      case 'copy-to-clipboard':
        clipboard.writeText(String(args.text))
        return undefined
      default:
        return undefined
    }
  }

  async shutdown(): Promise<void> {
    await this.runtime.stopAll()
  }
}

let singleton: PluginSystem | null = null

export function createPluginSystem(deps: PluginSystemDeps = {}): PluginSystem {
  singleton ??= new PluginSystem(deps)
  return singleton
}

export function getPluginSystem(): PluginSystem | null {
  return singleton
}
