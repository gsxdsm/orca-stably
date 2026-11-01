import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchLaunchComposer, type FreshComposerPtyHost } from './launch-composer-watch'

function host(
  readHermesSessionStart: (ptyId: string, since: number) => boolean
): FreshComposerPtyHost {
  return {
    readiness: {
      getPtyId: () => null,
      getForegroundProcess: async () => null,
      subscribeToData: () => () => {},
      readRecentOutput: () => undefined,
      write: () => {}
    },
    readHold: () => null,
    readForeground: async () => 'agent',
    readHermesSessionStart
  }
}

describe('Hermes launch submit readiness', () => {
  afterEach(() => vi.useRealTimers())

  it('holds until the session-start hook arrives without depending on screen text', async () => {
    vi.useFakeTimers()
    let ready = false
    const watches = new Map<string, Promise<boolean>>()
    watchLaunchComposer(
      watches,
      host(() => ready),
      'pty',
      'hermes'
    )
    const pending = watches.get('pty')!
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(settled).toBe(false)
    ready = true
    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toBe(true)
  })

  it('falls back to sending when the hook is unavailable', async () => {
    vi.useFakeTimers()
    const watches = new Map<string, Promise<boolean>>()
    watchLaunchComposer(
      watches,
      host(() => false),
      'pty',
      'hermes'
    )
    const pending = watches.get('pty')!
    await vi.advanceTimersByTimeAsync(60_000)
    await expect(pending).resolves.toBe(true)
  })
})
