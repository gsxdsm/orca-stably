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

describe('ui-bridge-client request()', () => {
  // Pull the reqId the bridge stamped onto the outbound message.
  function postedReqId(post: ReturnType<typeof vi.fn>): string {
    return (post.mock.calls[0][0] as { reqId: string }).reqId
  }

  it('resolves with the response carrying the matching reqId', async () => {
    const post = vi.fn()
    const win = fakeWindow({ parent: { postMessage: post } })
    const bridge = createUiBridge(win)
    const promise = bridge.request({ method: 'settings.get' })
    const reqId = postedReqId(post)
    ;(win.__emit as (d: unknown) => void)({ reqId, ok: true, result: 42 })
    await expect(promise).resolves.toEqual({ reqId, ok: true, result: 42 })
  })

  it('ignores responses with a non-matching reqId', async () => {
    vi.useFakeTimers()
    try {
      const post = vi.fn()
      const win = fakeWindow({ parent: { postMessage: post } })
      const bridge = createUiBridge(win)
      const promise = bridge.request({ method: 'settings.get' }, { timeoutMs: 1000 })
      const rejected = promise.catch((e: Error) => e.message)
      ;(win.__emit as (d: unknown) => void)({ reqId: 'someone-else', ok: true })
      vi.advanceTimersByTime(1000)
      expect(await rejected).toMatch(/timed out/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects after the timeout and removes its listener (no leak)', async () => {
    vi.useFakeTimers()
    try {
      const removeSpy = vi.fn()
      const post = vi.fn()
      const win = fakeWindow({ parent: { postMessage: post }, removeEventListener: removeSpy })
      const bridge = createUiBridge(win)
      const rejected = bridge.request({ method: 'x' }, { timeoutMs: 500 }).catch((e: Error) => e)
      vi.advanceTimersByTime(500)
      expect(await rejected).toBeInstanceOf(Error)
      expect(removeSpy).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the timeout on resolve so no late rejection fires', async () => {
    vi.useFakeTimers()
    try {
      const post = vi.fn()
      const win = fakeWindow({ parent: { postMessage: post } })
      const bridge = createUiBridge(win)
      const promise = bridge.request({ method: 'x' }, { timeoutMs: 1000 })
      ;(win.__emit as (d: unknown) => void)({ reqId: postedReqId(post), ok: true })
      await expect(promise).resolves.toMatchObject({ ok: true })
      // Advancing past the timeout must not throw an unhandled late rejection.
      vi.advanceTimersByTime(2000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('works on the RN substrate (JSON string transport)', async () => {
    const rnPost = vi.fn()
    const win = fakeWindow({ ReactNativeWebView: { postMessage: rnPost } })
    const bridge = createUiBridge(win)
    const promise = bridge.request({ method: 'settings.get' })
    const reqId = (JSON.parse(rnPost.mock.calls[0][0] as string) as { reqId: string }).reqId
    ;(win.__emit as (d: unknown) => void)(JSON.stringify({ reqId, ok: true }))
    await expect(promise).resolves.toMatchObject({ reqId, ok: true })
  })
})
