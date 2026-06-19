// NEEDS-RUNTIME-VERIFY: the main-process composition root for the plugin
// system. Builds the manager + runtime against Electron paths and wires the
// host command implementations (open-external-url / copy-to-clipboard) and the
// asset protocol. Unit-tested pieces (manager, runtime, gate, handler) are
// composed here; this glue runs only in the app.
//
// Remaining wiring this enables (each a small, explicit step):
//   - call registerPluginScheme() from app bootstrap BEFORE app.whenReady()
//   - on ready: createPluginSystem(), then registerPluginAssetProtocol()
//   - register the IPC handlers (src/main/ipc/plugins.ts) in register-core-handlers
//   - add the plugin-host-entry build target to electron.vite.config
//   - expose window.api.plugins in the preload

import { join } from 'node:path'
import { app, clipboard, shell } from 'electron'
import { PluginManager } from './plugin-manager'
import { PluginRuntime } from './plugin-runtime'
import { registerPluginAssetProtocol } from './plugin-asset-protocol'
import type { HostCommand, WorkspaceSnapshot } from '../../shared/plugin/api-contract'
import type { PluginStateEntry } from './plugin-store'
import type { OutputLine } from './plugin-output-buffer'

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

  constructor(deps: PluginSystemDeps = {}) {
    this.pluginsDir = join(app.getPath('userData'), 'plugins')
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

  list(): PluginStateEntry[] {
    return this.manager.list()
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
