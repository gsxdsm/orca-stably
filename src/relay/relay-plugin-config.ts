// Relay-side config for the right-sidebar plugin system (mobile path). The relay
// has no Electron userData dir, so plugin state lives under $HOME/.orca-relay —
// the same userData equivalent agent-hook-server.ts uses. Electron-free: this is
// part of the relay esbuild bundle and imports only node built-ins.

import { homedir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceSnapshot } from '../shared/plugin/api-contract'

// Why: mirror the $HOME/.orca-relay convention (see agent-hook-server.ts) so all
// relay-side state lives in one predictable per-user place.
const RELAY_USERDATA_DIR_NAME = '.orca-relay'

export function relayPluginsDir(): string {
  return join(homedir(), RELAY_USERDATA_DIR_NAME, 'plugins')
}

// Per-plugin active/installed state, alongside the plugins dir.
export function relayPluginStateFilePath(): string {
  return join(homedir(), RELAY_USERDATA_DIR_NAME, 'plugins-state.json')
}

// The built plugin-host-entry the trusted child runs. Provisioning this file to
// the relay host is deferred (NEEDS-RUNTIME-VERIFY); the path is overridable so
// provisioning can place it wherever it lands. Default sits alongside the relay
// userData so plugins + entry are provisioned together.
export function relayPluginHostEntryPath(): string {
  const override = process.env.ORCA_RELAY_PLUGIN_HOST_ENTRY?.trim()
  return override || join(homedir(), RELAY_USERDATA_DIR_NAME, 'plugin-host-entry.js')
}

// The relay no longer tracks a live workspace root (RelayContext.registerRoot is
// a no-op), so the only workspace:read surface returns a bounded empty snapshot.
// NEEDS-RUNTIME-VERIFY: the remote-provisioning tier replaces this with a real
// per-session snapshot once the relay tracks an active workspace again.
export function defaultRelayWorkspaceSnapshot(): WorkspaceSnapshot {
  return {
    workspaceName: '',
    currentBranch: null,
    isDirty: false,
    openFileCount: 0
  }
}
