import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerRelayPluginHandlers, type RelayDispatcherLike } from './plugin-handler'

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acme.foo',
    name: 'Foo',
    version: '1.0.0',
    hostApiVersion: '0.1.0',
    main: 'main.js',
    contributes: { sidebar: { title: 'Foo', icon: 'Activity', ui: 'index.html' } },
    capabilities: ['workspace:read'],
    ...overrides
  }
}

let tmp: string
let handlers: Map<string, (params: Record<string, unknown>, ctx: unknown) => Promise<unknown>>

function fakeDispatcher(): RelayDispatcherLike {
  handlers = new Map()
  return { onRequest: (method, handler) => handlers.set(method, handler) }
}

function installFixture(): void {
  const dir = join(tmp, 'acme.foo')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest()))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><body>hi</body>')
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'relay-plugin-'))
  registerRelayPluginHandlers(fakeDispatcher(), {
    pluginsDir: tmp,
    getWorkspaceSnapshot: () => ({
      workspaceName: 'w',
      currentBranch: 'main',
      isDirty: false,
      openFileCount: 1
    })
  })
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('relay plugin handlers', () => {
  it('plugin.list returns discovered plugins', async () => {
    installFixture()
    const result = (await handlers.get('plugin.list')!({}, null)) as { plugins: { id: string }[] }
    expect(result.plugins.map((p) => p.id)).toEqual(['acme.foo'])
  })

  it('plugin.getEntry returns the single UI html', async () => {
    installFixture()
    const result = (await handlers.get('plugin.getEntry')!({ pluginId: 'acme.foo' }, null)) as {
      ok: boolean
      html?: string
    }
    expect(result.ok).toBe(true)
    expect(result.html).toContain('<body>hi</body>')
  })

  it('plugin.getEntry rejects an unknown plugin', async () => {
    const result = (await handlers.get('plugin.getEntry')!({ pluginId: 'nope' }, null)) as {
      ok: boolean
    }
    expect(result.ok).toBe(false)
  })

  it('plugin.bridge gates workspace.getSnapshot and returns a projected snapshot', async () => {
    installFixture()
    const ok = (await handlers.get('plugin.bridge')!(
      { pluginId: 'acme.foo', request: { reqId: 'r1', method: 'workspace.getSnapshot' } },
      null
    )) as { ok: boolean; result?: Record<string, unknown> }
    expect(ok.ok).toBe(true)
    expect(Object.keys(ok.result ?? {}).sort()).toEqual([
      'currentBranch',
      'isDirty',
      'openFileCount',
      'workspaceName'
    ])
  })

  it('plugin.bridge denies an undeclared capability', async () => {
    installFixture()
    const denied = (await handlers.get('plugin.bridge')!(
      { pluginId: 'acme.foo', request: { reqId: 'r1', method: 'settings.get' } },
      null
    )) as { ok: boolean; error?: string }
    expect(denied.ok).toBe(false)
    expect(denied.error).toBe('capability_denied')
  })
})
