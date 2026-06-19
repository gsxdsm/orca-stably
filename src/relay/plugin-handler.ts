// NEEDS-RUNTIME-VERIFY: relay-side plugin host (mobile path). Registers plugin.*
// JSON-RPC methods so the mobile app can list plugins, fetch a plugin's single
// UI HTML, run the trusted backend child on the relay host, and round-trip
// UI<->backend messages — all where the workspace lives (the relay host,
// possibly remote over SSH).
//
// The backend bridge is asynchronous message-passing (mirroring the desktop):
// inbound webview messages are posted into the child via plugin.postUi; the
// child answers with its own capability-gated handler and posts responses back,
// which we push to the mobile client as plugin.uiMessage notifications. The
// in-webview ui-bridge-client correlates reqIds, so settings/workspace round
// trips work without the relay parsing the payload. Host commands
// (open-url/clipboard) act on the device and are denied by the runtime (device
// round-trip deferred).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { discoverPlugins } from '../main/plugin/plugin-discovery'
import { isSafePluginId } from '../shared/plugin/manifest'
import type { WorkspaceSnapshot } from '../shared/plugin/api-contract'
import type { PluginHostFactory } from '../main/plugin/plugin-runtime'
import { createRelayPluginRuntime } from './relay-plugin-runtime'

export type RelayDispatcherLike = {
  onRequest(
    method: string,
    handler: (params: Record<string, unknown>, context: unknown) => Promise<unknown>
  ): void
  notify(method: string, params?: Record<string, unknown>): void
}

export type RelayPluginConfig = {
  pluginsDir: string
  getWorkspaceSnapshot: () => WorkspaceSnapshot | Promise<WorkspaceSnapshot>
  // Optional overrides (tests / provisioning): the built host-entry path, the
  // state file, and an injectable host factory to avoid forking real processes.
  entryPath?: string
  stateFilePath?: string
  hostFactory?: PluginHostFactory
}

type PluginMeta = { id: string; title: string; icon: string; version: string; ui: string }

// Boundary validation: the id must be structurally safe AND match an installed,
// validated manifest. Both gates run before any activation/messaging so a client
// can't name an arbitrary id (closes the confused-deputy concern for the backend
// path), and so traversal-shaped ids never reach the runtime.
function isInstalledPlugin(pluginsDir: string, pluginId: string): boolean {
  if (!isSafePluginId(pluginId)) {
    return false
  }
  return discoverPlugins(pluginsDir).valid.some((p) => p.manifest.id === pluginId)
}

export function registerRelayPluginHandlers(
  dispatcher: RelayDispatcherLike,
  config: RelayPluginConfig
): { stopAll: () => Promise<void> } {
  const { runtime } = createRelayPluginRuntime({
    pluginsDir: config.pluginsDir,
    entryPath: config.entryPath,
    stateFilePath: config.stateFilePath,
    getWorkspaceSnapshot: config.getWorkspaceSnapshot,
    // Child outbound messages (bridge responses + lifecycle events) are pushed
    // to the mobile client; the webview's ui-bridge-client matches reqIds.
    onUiMessage: (pluginId, message) =>
      dispatcher.notify('plugin.uiMessage', { pluginId, message }),
    hostFactory: config.hostFactory
  })

  dispatcher.onRequest('plugin.list', async () => {
    const result = discoverPlugins(config.pluginsDir)
    const plugins: PluginMeta[] = result.valid.map((p) => ({
      id: p.manifest.id,
      title: p.manifest.contributes.sidebar.title,
      icon: p.manifest.contributes.sidebar.icon,
      version: p.manifest.version,
      ui: p.manifest.contributes.sidebar.ui
    }))
    return { plugins }
  })

  // Serve a plugin's single UI HTML inline (mobile feeds it to react-native-
  // webview as { html } — no on-device server, which is why v1 mandates a
  // single self-contained file).
  dispatcher.onRequest('plugin.getEntry', async (params) => {
    const pluginId = String(params.pluginId ?? '')
    const found = discoverPlugins(config.pluginsDir).valid.find((p) => p.manifest.id === pluginId)
    if (!found) {
      return { ok: false, error: 'unknown_plugin' }
    }
    // Use the discovered dir, not a re-join of the client-supplied pluginId, so
    // the served path is anchored to a validated manifest's own directory.
    const htmlPath = join(found.dir, found.manifest.contributes.sidebar.ui)
    if (!existsSync(htmlPath)) {
      return { ok: false, error: 'entry_missing' }
    }
    return { ok: true, html: readFileSync(htmlPath, 'utf8') }
  })

  // Start the trusted backend child on the relay host.
  dispatcher.onRequest('plugin.activate', async (params) => {
    const pluginId = String(params.pluginId ?? '')
    if (!isInstalledPlugin(config.pluginsDir, pluginId)) {
      return { ok: false, error: 'unknown_plugin' }
    }
    return runtime.activate(pluginId)
  })

  // Stop the backend child.
  dispatcher.onRequest('plugin.deactivate', async (params) => {
    const pluginId = String(params.pluginId ?? '')
    if (!isSafePluginId(pluginId)) {
      return { ok: false, error: 'invalid_params' }
    }
    await runtime.deactivate(pluginId)
    return { ok: true }
  })

  // Inbound webview -> backend message. Lazily activates so a message that races
  // ahead of an explicit activate still reaches a running child.
  dispatcher.onRequest('plugin.postUi', async (params) => {
    const pluginId = String(params.pluginId ?? '')
    if (!isInstalledPlugin(config.pluginsDir, pluginId)) {
      return { ok: false, error: 'unknown_plugin' }
    }
    if (!runtime.isRunning(pluginId)) {
      const activated = await runtime.activate(pluginId)
      if (!activated.ok) {
        return { ok: false, error: 'activation_failed' }
      }
    }
    runtime.postUi(pluginId, params.message)
    return { ok: true }
  })

  return { stopAll: () => runtime.stopAll() }
}
