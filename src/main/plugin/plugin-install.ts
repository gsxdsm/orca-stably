// Install a plugin from a user-selected local folder (the v1a dev-loop source).
// Validates the source manifest BEFORE copying so nothing lands on disk for an
// invalid bundle. Copying a folder runs no lifecycle scripts — the
// dependency-install path (with scripts disabled) arrives with the vendored
// installer in a later unit.

import { cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { readManifestRaw } from './plugin-discovery'
import { validatePluginManifest } from '../../shared/plugin/manifest-validate'

export type InstallResult =
  | { ok: true; id: string; version: string; dir: string }
  | { ok: false; errors: string[] }

// Validate the source manifest, then copy the folder into `pluginsDir/<id>/`.
// A reinstall of the same id replaces the destination atomically-enough
// (remove then copy). Invalid manifests write nothing.
export function installFromLocalFolder(sourceDir: string, pluginsDir: string): InstallResult {
  if (!existsSync(sourceDir)) {
    return { ok: false, errors: [`source folder does not exist: ${sourceDir}`] }
  }
  const validated = validatePluginManifest(readManifestRaw(sourceDir))
  if (!validated.ok) {
    return { ok: false, errors: validated.errors }
  }
  const { id, version } = validated.manifest
  const dest = join(pluginsDir, id)
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true })
  }
  cpSync(sourceDir, dest, { recursive: true })
  return { ok: true, id, version, dir: dest }
}
