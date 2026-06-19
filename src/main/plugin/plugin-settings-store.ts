// Per-plugin settings persistence (U13). Each plugin's settings live in their
// OWN file — `<pluginsDir>/<id>/settings.json` — not a shared namespaced blob,
// so one plugin's settings path can never resolve into another's. Writes are
// validated against the manifest's `settingsSchema` when present.
//
// Cross-plugin READ of another plugin's file is possible by design (plugins are
// trusted, with full Node access) — documented in the security notes; users
// should not store cross-sensitive secrets in plugin settings.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { validateAgainstSchema, type SchemaValidation } from '../../shared/plugin/settings-schema'

// A plugin id must be a single safe path segment (no separators / traversal) so
// it cannot escape its own directory. Plugin ids look like `acme.foo`.
export function isSafePluginId(id: string): boolean {
  return (
    id.length > 0 &&
    !id.includes('/') &&
    !id.includes('\\') &&
    id !== '.' &&
    id !== '..' &&
    !id.includes('..')
  )
}

export function pluginSettingsPath(pluginsDir: string, id: string): string {
  if (!isSafePluginId(id)) {
    throw new Error(`unsafe plugin id: ${id}`)
  }
  return join(pluginsDir, id, 'settings.json')
}

export type SettingsWriteResult = { ok: true } | { ok: false; errors: string[] }

export class PluginSettingsStore {
  private readonly filePath: string

  constructor(
    pluginsDir: string,
    pluginId: string,
    private readonly settingsSchema?: Record<string, unknown>
  ) {
    this.filePath = pluginSettingsPath(pluginsDir, pluginId)
  }

  private read(): Record<string, unknown> {
    try {
      if (!existsSync(this.filePath)) {
        return {}
      }
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Corrupt settings reset to empty rather than crashing the plugin host.
    }
    return {}
  }

  private write(settings: Record<string, unknown>): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(settings, null, 2), 'utf8')
  }

  getAll(): Record<string, unknown> {
    return this.read()
  }

  get<T = unknown>(key: string): T | undefined {
    return this.read()[key] as T | undefined
  }

  // Apply the change, validate the RESULTING object against the schema (when
  // present), and persist only if valid. Invalid writes leave the file untouched.
  set(key: string, value: unknown): SettingsWriteResult {
    const next = { ...this.read(), [key]: value }
    const validation = this.validate(next)
    if (!validation.ok) {
      return validation
    }
    this.write(next)
    return { ok: true }
  }

  delete(key: string): void {
    const current = this.read()
    if (!(key in current)) {
      return
    }
    delete current[key]
    this.write(current)
  }

  private validate(settings: Record<string, unknown>): SchemaValidation {
    if (!this.settingsSchema) {
      return { ok: true }
    }
    return validateAgainstSchema(settings, this.settingsSchema)
  }
}
