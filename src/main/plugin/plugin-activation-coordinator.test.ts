import { describe, expect, it, vi } from 'vitest'
import { activatePluginForWorkspace, type ActivationDeps } from './plugin-activation-coordinator'
import type { PluginBundle } from './plugin-bundle'

const bundle: PluginBundle = { pluginId: 'acme.foo', files: [], integrity: 'h' }

// A relay request fn that records calls and returns canned results per method.
function fakeRelay(results: Record<string, unknown>): {
  request: ActivationDeps['relayRequest']
  calls: { method: string; params?: Record<string, unknown> }[]
} {
  const calls: { method: string; params?: Record<string, unknown> }[] = []
  const request: ActivationDeps['relayRequest'] = (method, params) => {
    calls.push({ method, params })
    return Promise.resolve(results[method])
  }
  return { request, calls }
}

function deps(over: Partial<ActivationDeps> = {}): ActivationDeps {
  return {
    pluginsDir: '/plugins',
    localActivate: vi.fn(() => ({ ok: true }) as const),
    relayRequest: () => Promise.resolve({ ok: true }),
    readBundle: () => bundle,
    ...over
  }
}

describe('activatePluginForWorkspace', () => {
  it('activates locally and touches neither bundle nor relay when not remote', async () => {
    const localActivate = vi.fn(() => ({ ok: true }) as const)
    const readBundle = vi.fn(() => bundle)
    const { request, calls } = fakeRelay({})
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: null },
      deps({ localActivate, readBundle, relayRequest: request })
    )
    expect(result).toEqual({ ok: true })
    expect(localActivate).toHaveBeenCalledWith('acme.foo')
    expect(readBundle).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('remote happy path provisions then activates, in that order', async () => {
    const localActivate = vi.fn(() => ({ ok: true }) as const)
    const { request, calls } = fakeRelay({
      'plugin.provision': { ok: true },
      'plugin.activate': { ok: true }
    })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ localActivate, relayRequest: request })
    )
    expect(result).toEqual({ ok: true })
    expect(localActivate).not.toHaveBeenCalled()
    expect(calls.map((c) => c.method)).toEqual(['plugin.provision', 'plugin.activate'])
    expect(calls[0].params).toEqual({ bundle })
    expect(calls[1].params).toEqual({ pluginId: 'acme.foo' })
  })

  it('aborts before activate when provisioning fails', async () => {
    const { request, calls } = fakeRelay({
      'plugin.provision': { ok: false, error: 'integrity_mismatch' }
    })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'integrity_mismatch' })
    expect(calls.map((c) => c.method)).toEqual(['plugin.provision'])
  })

  it('returns a typed error when the bundle read throws (no relay calls)', async () => {
    const { request, calls } = fakeRelay({ 'plugin.provision': { ok: true } })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({
        relayRequest: request,
        readBundle: () => {
          throw new Error('ENOENT plugin dir')
        }
      })
    )
    expect(result).toEqual({ ok: false, error: 'ENOENT plugin dir' })
    expect(calls).toEqual([])
  })

  it('maps a rejected remote activate to a typed failure (not a throw)', async () => {
    const request: ActivationDeps['relayRequest'] = (method) =>
      method === 'plugin.provision'
        ? Promise.resolve({ ok: true })
        : Promise.reject(new Error('relay disconnected'))
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'relay disconnected' })
  })

  it('reports a relay activate that returns ok:false', async () => {
    const { request } = fakeRelay({
      'plugin.provision': { ok: true },
      'plugin.activate': { ok: false, error: 'unknown_plugin' }
    })
    const result = await activatePluginForWorkspace(
      { pluginId: 'acme.foo', remote: { isRemote: true } },
      deps({ relayRequest: request })
    )
    expect(result).toEqual({ ok: false, error: 'unknown_plugin' })
  })
})
