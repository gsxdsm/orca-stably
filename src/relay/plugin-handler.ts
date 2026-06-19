// NEEDS-RUNTIME-VERIFY: relay-side plugin host (mobile path). Registers plugin.*
// JSON-RPC methods so the mobile app can list plugins, fetch a plugin's single
// UI HTML, and route UI->backend bridge calls — all running where the workspace
// lives (the relay host, possibly remote over SSH). Reuses the SHARED, electron-
// free capability gate so the relay and the desktop main path enforce identical
// decisions (KTD3); it does NOT import electron or src/main glue.
//
// v1c scope: list + getEntry + gated workspace snapshot. Running the trusted
// backend child on the relay host and the host commands (open-url/clipboard,
// which must round-trip to the device) are the follow-on remote-provisioning
// work the plan flags as the hardest tier.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { discoverPlugins } from '../main/plugin/plugin-discovery'
import { gateBridgeMethod, projectWorkspaceSnapshot } from '../shared/plugin/capability-gate'
import type {
  BridgeRequest,
  BridgeResponse,
  WorkspaceSnapshot
} from '../shared/plugin/api-contract'
import type { PluginCapability } from '../shared/plugin/manifest'

export type RelayDispatcherLike = {
  onRequest(
    method: string,
    handler: (params: Record<string, unknown>, context: unknown) => Promise<unknown>
  ): void
}

export type RelayPluginConfig = {
  pluginsDir: string
  getWorkspaceSnapshot: () => WorkspaceSnapshot | Promise<WorkspaceSnapshot>
}

type PluginMeta = { id: string; title: string; icon: string; version: string; ui: string }

function capabilitiesFor(pluginsDir: string, pluginId: string): PluginCapability[] | null {
  const found = discoverPlugins(pluginsDir).valid.find((p) => p.manifest.id === pluginId)
  return found ? found.manifest.capabilities : null
}

export function registerRelayPluginHandlers(
  dispatcher: RelayDispatcherLike,
  config: RelayPluginConfig
): void {
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
    const htmlPath = join(config.pluginsDir, pluginId, found.manifest.contributes.sidebar.ui)
    if (!existsSync(htmlPath)) {
      return { ok: false, error: 'entry_missing' }
    }
    return { ok: true, html: readFileSync(htmlPath, 'utf8') }
  })

  // UI -> backend bridge, capability-gated by the SHARED gate.
  dispatcher.onRequest('plugin.bridge', async (params) => {
    const pluginId = String(params.pluginId ?? '')
    const request = params.request as BridgeRequest | undefined
    if (!request || typeof request.reqId !== 'string') {
      return { ok: false, error: 'invalid_params' } satisfies
        | BridgeResponse
        | { ok: false; error: string }
    }
    const declared = capabilitiesFor(config.pluginsDir, pluginId)
    if (!declared) {
      return { reqId: request.reqId, ok: false, error: 'unknown_plugin' } satisfies BridgeResponse
    }
    const decision = gateBridgeMethod(declared, request.method)
    if (!decision.granted) {
      return { reqId: request.reqId, ok: false, error: decision.error } satisfies BridgeResponse
    }
    if (request.method === 'workspace.getSnapshot') {
      const snapshot = projectWorkspaceSnapshot(await config.getWorkspaceSnapshot())
      return { reqId: request.reqId, ok: true, result: snapshot } satisfies BridgeResponse
    }
    // commands/settings on the relay require the trusted backend + device
    // round-trip (deferred); deny cleanly for now rather than half-acting.
    return { reqId: request.reqId, ok: false, error: 'internal' } satisfies BridgeResponse
  })
}
