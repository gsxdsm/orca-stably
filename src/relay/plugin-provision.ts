// Relay-side receipt of a provisioned plugin bundle: verify integrity + paths
// (shared codec), stage the files to a temp dir, validate the embedded manifest
// and id, then atomically rename into relayPluginsDir()/<id>. Electron-free.
// Nothing is written unless every check passes; a partial stage is cleaned up.

import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isSafePluginId } from '../shared/plugin/manifest'
import { validatePluginManifest } from '../shared/plugin/manifest-validate'
import { readManifestRaw } from '../main/plugin/plugin-discovery'
import { verifyPluginBundle, type PluginBundle } from '../main/plugin/plugin-bundle'

export type ProvisionResult = { ok: true } | { ok: false; error: string }
export type ProvisionConfig = { pluginsDir: string; stagingDir: string }

export function provisionPlugin(bundle: unknown, config: ProvisionConfig): ProvisionResult {
  const verified = verifyPluginBundle(bundle)
  if (!verified.ok) {
    return { ok: false, error: verified.error }
  }
  const pluginId = (bundle as PluginBundle).pluginId
  // Reject an unsafe id before touching the filesystem.
  if (!isSafePluginId(pluginId)) {
    return { ok: false, error: 'unsafe_plugin_id' }
  }

  mkdirSync(config.stagingDir, { recursive: true })
  const staged = mkdtempSync(join(config.stagingDir, `${pluginId}-`))
  try {
    for (const file of verified.files) {
      const target = join(staged, file.path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, Buffer.from(file.dataBase64, 'base64'))
    }
    // Reuse the canonical manifest read (plugin.json or package.json#orca) +
    // validation rather than re-parsing, so the relay and installer agree.
    const raw = readManifestRaw(staged)
    if (raw === null) {
      return fail(staged, 'missing_manifest')
    }
    const validated = validatePluginManifest(raw)
    if (!validated.ok) {
      return fail(staged, 'invalid_manifest')
    }
    if (validated.manifest.id !== pluginId) {
      return fail(staged, 'manifest_id_mismatch')
    }
    const dest = join(config.pluginsDir, pluginId)
    mkdirSync(config.pluginsDir, { recursive: true })
    // Replace any prior copy atomically: clear the target, then rename the
    // fully-staged dir into place (same volume — sibling staging dir).
    rmSync(dest, { recursive: true, force: true })
    renameSync(staged, dest)
    return { ok: true }
  } catch (error) {
    return fail(staged, error instanceof Error ? error.message : 'write_failed')
  }
}

function fail(staged: string, error: string): ProvisionResult {
  rmSync(staged, { recursive: true, force: true })
  return { ok: false, error }
}
