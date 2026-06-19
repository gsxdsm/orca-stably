// Decides how a plugin activates: locally (in-process, the default) or on a
// remote relay (provision the files, then activate over the relay dispatcher).
// Pure + dependency-injected — the relay request fn, local activate fn, and
// bundle reader are all supplied, so this is fully unit-testable without a real
// relay or fork. The production call site that supplies a live relay request fn
// + a real remote descriptor is the NEEDS-RUNTIME-VERIFY seam (see plugin-system).

import {
  provisionToRelay,
  readPluginBundleFromDisk,
  shouldProvisionToRelay,
  type RelayRequest
} from './plugin-remote-provision'
import type { PluginBundle } from './plugin-bundle'

export type ActivationResult = { ok: true } | { ok: false; error: string }

// A workspace is remote when its plugin backend must run on a relay host.
export type RemoteDescriptor = { isRemote?: boolean } | null | undefined

export type ActivationDeps = {
  pluginsDir: string
  localActivate: (pluginId: string) => Promise<ActivationResult> | ActivationResult
  relayRequest: RelayRequest
  // Injectable for tests; defaults to the real disk reader.
  readBundle?: (pluginsDir: string, pluginId: string) => PluginBundle
}

// Local workspaces activate in-process unchanged. Remote workspaces package the
// installed plugin, provision it to the relay, and only on provision success
// activate it there — a provision failure aborts without attempting activate.
export async function activatePluginForWorkspace(
  params: { pluginId: string; remote: RemoteDescriptor },
  deps: ActivationDeps
): Promise<ActivationResult> {
  if (!shouldProvisionToRelay(params.remote)) {
    return deps.localActivate(params.pluginId)
  }

  const readBundle = deps.readBundle ?? readPluginBundleFromDisk
  let bundle: PluginBundle
  try {
    bundle = readBundle(deps.pluginsDir, params.pluginId)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'bundle_read_failed' }
  }

  const provisioned = await provisionToRelay(deps.relayRequest, bundle)
  if (!provisioned.ok) {
    return { ok: false, error: provisioned.error ?? 'provision_failed' }
  }

  try {
    const result = (await deps.relayRequest('plugin.activate', { pluginId: params.pluginId })) as
      | { ok?: boolean; error?: string }
      | null
      | undefined
    if (!result || typeof result.ok !== 'boolean') {
      return { ok: false, error: 'no_response' }
    }
    return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'activate_failed' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'activate_failed' }
  }
}
