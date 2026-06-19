import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerRelayPluginHandlers, type RelayDispatcherLike } from './plugin-handler'
import type { PluginHostConfig } from '../main/plugin/plugin-host-process'
import type { PluginHostLike } from '../main/plugin/plugin-runtime'

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

type Handler = (params: Record<string, unknown>, ctx: unknown) => Promise<unknown>
type FakeHost = PluginHostLike & { config: PluginHostConfig; posted: unknown[] }

let tmp: string
let handlers: Map<string, Handler>
let notifications: { method: string; params?: Record<string, unknown> }[]
let hosts: FakeHost[]

function fakeDispatcher(): RelayDispatcherLike {
  handlers = new Map()
  notifications = []
  return {
    onRequest: (method, handler) => handlers.set(method, handler),
    notify: (method, params) => notifications.push({ method, params })
  }
}

function fakeHostFactory(config: PluginHostConfig): FakeHost {
  const host: FakeHost = {
    config,
    posted: [],
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    isRunning: () => true,
    postUi: (message) => host.posted.push(message)
  }
  hosts.push(host)
  return host
}

function installFixture(id = 'acme.foo'): void {
  const dir = join(tmp, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest({ id })))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><body>hi</body>')
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'relay-plugin-'))
  hosts = []
  registerRelayPluginHandlers(fakeDispatcher(), {
    pluginsDir: tmp,
    stateFilePath: join(tmp, 'state.json'),
    getWorkspaceSnapshot: () => ({
      workspaceName: 'w',
      currentBranch: 'main',
      isDirty: false,
      openFileCount: 1
    }),
    hostFactory: fakeHostFactory
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

  it('plugin.getEntry reports entry_missing when the UI file is absent', async () => {
    const dir = join(tmp, 'acme.foo')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest()))
    const result = (await handlers.get('plugin.getEntry')!({ pluginId: 'acme.foo' }, null)) as {
      ok: boolean
      error?: string
    }
    expect(result).toEqual({ ok: false, error: 'entry_missing' })
  })

  it('plugin.activate starts the backend for an installed plugin', async () => {
    installFixture()
    const result = (await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, null)) as {
      ok: boolean
    }
    expect(result.ok).toBe(true)
    expect(hosts).toHaveLength(1)
    expect(hosts[0].config.pluginId).toBe('acme.foo')
  })

  it('plugin.activate rejects an unknown id before forking', async () => {
    const result = (await handlers.get('plugin.activate')!({ pluginId: 'nope' }, null)) as {
      ok: boolean
      error?: string
    }
    expect(result).toEqual({ ok: false, error: 'unknown_plugin' })
    expect(hosts).toHaveLength(0)
  })

  it('plugin.activate rejects a traversal-shaped id before forking', async () => {
    const result = (await handlers.get('plugin.activate')!({ pluginId: '../evil' }, null)) as {
      ok: boolean
    }
    expect(result.ok).toBe(false)
    expect(hosts).toHaveLength(0)
  })

  it('plugin.postUi lazily activates and forwards the message to the child', async () => {
    installFixture()
    const result = (await handlers.get('plugin.postUi')!(
      { pluginId: 'acme.foo', message: { reqId: 'r1', method: 'settings.get' } },
      null
    )) as { ok: boolean }
    expect(result.ok).toBe(true)
    expect(hosts).toHaveLength(1)
    expect(hosts[0].posted).toEqual([{ reqId: 'r1', method: 'settings.get' }])
  })

  it('plugin.postUi rejects an unknown id', async () => {
    const result = (await handlers.get('plugin.postUi')!(
      { pluginId: 'nope', message: {} },
      null
    )) as { ok: boolean; error?: string }
    expect(result).toEqual({ ok: false, error: 'unknown_plugin' })
  })

  it('pushes child outbound messages to the client as plugin.uiMessage notifications', async () => {
    installFixture()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, null)
    // Simulate the child posting a bridge response back out.
    hosts[0].config.onUiMessage!({ reqId: 'r1', ok: true, result: null })
    expect(notifications).toContainEqual({
      method: 'plugin.uiMessage',
      params: { pluginId: 'acme.foo', message: { reqId: 'r1', ok: true, result: null } }
    })
  })

  it('plugin.deactivate stops the backend', async () => {
    installFixture()
    await handlers.get('plugin.activate')!({ pluginId: 'acme.foo' }, null)
    const result = (await handlers.get('plugin.deactivate')!({ pluginId: 'acme.foo' }, null)) as {
      ok: boolean
    }
    expect(result.ok).toBe(true)
  })
})
