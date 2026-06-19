import { describe, expect, it, vi } from 'vitest'
import { createUiBridge, isReactNativeSubstrate } from './ui-bridge-client'

function fakeWindow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const listeners: Record<string, ((e: { data: unknown }) => void)[]> = {}
  return {
    addEventListener: (type: string, cb: (e: { data: unknown }) => void) => {
      ;(listeners[type] ??= []).push(cb)
    },
    removeEventListener: (type: string, cb: (e: { data: unknown }) => void) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== cb)
    },
    // test helper to emit a message
    __emit: (data: unknown) => (listeners.message ?? []).forEach((l) => l({ data })),
    ...overrides
  }
}

describe('ui-bridge-client substrate detection', () => {
  it('detects the react-native-webview substrate', () => {
    expect(isReactNativeSubstrate({ ReactNativeWebView: { postMessage: () => {} } })).toBe(true)
    expect(isReactNativeSubstrate({})).toBe(false)
  })

  it('mobile: posts JSON via ReactNativeWebView and parses JSON on receive', () => {
    const rnPost = vi.fn()
    const win = fakeWindow({ ReactNativeWebView: { postMessage: rnPost } })
    const bridge = createUiBridge(win)

    bridge.postMessage({ hello: 'world' })
    expect(rnPost).toHaveBeenCalledWith(JSON.stringify({ hello: 'world' }))

    const received: unknown[] = []
    bridge.onMessage((m) => received.push(m))
    ;(win.__emit as (d: unknown) => void)(JSON.stringify({ from: 'host' }))
    expect(received).toEqual([{ from: 'host' }])
  })

  it('desktop: posts structured data to the embedder and receives structured data', () => {
    const parentPost = vi.fn()
    const win = fakeWindow({ parent: { postMessage: parentPost } })
    const bridge = createUiBridge(win)

    bridge.postMessage({ hello: 'world' })
    expect(parentPost).toHaveBeenCalledWith({ hello: 'world' }, '*')

    const received: unknown[] = []
    bridge.onMessage((m) => received.push(m))
    ;(win.__emit as (d: unknown) => void)({ from: 'host' })
    expect(received).toEqual([{ from: 'host' }])
  })

  it('onMessage returns an unsubscribe that stops delivery', () => {
    const win = fakeWindow({ parent: { postMessage: vi.fn() } })
    const bridge = createUiBridge(win)
    const received: unknown[] = []
    const off = bridge.onMessage((m) => received.push(m))
    off()
    ;(win.__emit as (d: unknown) => void)({ x: 1 })
    expect(received).toEqual([])
  })
})
