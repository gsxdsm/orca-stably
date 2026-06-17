import { describe, expect, it, vi } from 'vitest'
import { TerminalReadTailStream } from './terminal-read-tail-stream'
import type { RuntimeTerminalRead } from '../../shared/runtime-types'
import type { TuiRpcClient } from './tui-rpc-client'

function read(overrides: Partial<RuntimeTerminalRead> = {}): RuntimeTerminalRead {
  return {
    handle: 'term_1',
    status: 'running',
    tail: [],
    truncated: false,
    nextCursor: null,
    ...overrides
  }
}

function clientReturning(reads: RuntimeTerminalRead[]): {
  client: TuiRpcClient
  call: ReturnType<typeof vi.fn>
} {
  let index = 0
  const call = vi.fn(async () => {
    const terminal = reads[Math.min(index, reads.length - 1)]
    index += 1
    // terminal.read wraps its payload in a `terminal` envelope key.
    return { result: { terminal } }
  })
  return { client: { call } as unknown as TuiRpcClient, call }
}

describe('TerminalReadTailStream', () => {
  it('appends only new lines across cursor-paged reads (no duplication)', async () => {
    const { client } = clientReturning([
      read({ tail: ['line 1', 'line 2'], nextCursor: '12' }),
      read({ tail: ['line 3'], nextCursor: '13' })
    ])
    const stream = new TerminalReadTailStream(client, 'term_1')
    await stream.refreshOnce()
    await stream.refreshOnce()
    expect(stream.getState().lines).toEqual(['line 1', 'line 2', 'line 3'])
  })

  it('passes the prior nextCursor as a number on the following read', async () => {
    const { client, call } = clientReturning([
      read({ tail: ['a'], nextCursor: '42' }),
      read({ tail: ['b'], nextCursor: '43' })
    ])
    const stream = new TerminalReadTailStream(client, 'term_1')
    await stream.refreshOnce()
    await stream.refreshOnce()
    expect(call.mock.calls[0][1]).toMatchObject({ terminal: 'term_1', cursor: undefined })
    // cursor must be a non-negative integer per the terminal.read schema
    expect(call.mock.calls[1][1]).toMatchObject({ cursor: 42 })
  })

  it('does not reset the cursor (or re-fetch the preview) when nextCursor is null', async () => {
    const { client, call } = clientReturning([
      read({ tail: ['a'], nextCursor: '5' }),
      read({ tail: [], nextCursor: null }),
      read({ tail: ['b'], nextCursor: '6' })
    ])
    const stream = new TerminalReadTailStream(client, 'term_1')
    await stream.refreshOnce()
    await stream.refreshOnce()
    await stream.refreshOnce()
    // the null-cursor tick must keep cursor at 5, not drop to undefined
    expect(call.mock.calls[1][1]).toMatchObject({ cursor: 5 })
    expect(call.mock.calls[2][1]).toMatchObject({ cursor: 5 })
    expect(stream.getState().lines).toEqual(['a', 'b'])
  })

  it('marks the terminal exited and stops polling it', async () => {
    const { client, call } = clientReturning([read({ status: 'exited', tail: ['bye'] })])
    const pending: (() => void)[] = []
    const stream = new TerminalReadTailStream(client, 'term_1', {
      setTimer: (cb) => {
        pending.push(cb)
        return 0 as unknown as ReturnType<typeof setTimeout>
      },
      clearTimer: () => {}
    })
    stream.start()
    await Promise.resolve()
    await Promise.resolve()
    expect(stream.getState().status).toBe('exited')
    // exited terminals are not rescheduled
    expect(pending).toHaveLength(0)
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('surfaces a truncated buffer', async () => {
    const { client } = clientReturning([read({ tail: ['x'], truncated: true })])
    const stream = new TerminalReadTailStream(client, 'term_1')
    await stream.refreshOnce()
    expect(stream.getState().truncated).toBe(true)
  })

  it('flags a degraded remote PTY with no recoverable snapshot', async () => {
    const { client } = clientReturning([read({ status: 'unknown', tail: [] })])
    const stream = new TerminalReadTailStream(client, 'term_1', { isRemote: true })
    await stream.refreshOnce()
    expect(stream.getState().degraded).toBe(true)
  })

  it('does not flag degraded for a local unknown terminal', async () => {
    const { client } = clientReturning([read({ status: 'unknown', tail: [] })])
    const stream = new TerminalReadTailStream(client, 'term_1', { isRemote: false })
    await stream.refreshOnce()
    expect(stream.getState().degraded).toBe(false)
  })

  it('notifies subscribers and stops notifying after unsubscribe', async () => {
    const { client } = clientReturning([
      read({ tail: ['a'], nextCursor: '1' }),
      read({ tail: ['b'], nextCursor: '2' })
    ])
    const stream = new TerminalReadTailStream(client, 'term_1')
    const listener = vi.fn()
    const unsubscribe = stream.subscribe(listener)
    expect(listener).toHaveBeenCalledTimes(1) // immediate current-state notify
    await stream.refreshOnce()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    await stream.refreshOnce()
    expect(listener).toHaveBeenCalledTimes(2) // no further notifications
  })

  it('marks disconnected when the read fails', async () => {
    const call = vi.fn(async () => {
      throw new Error('socket closed')
    })
    const stream = new TerminalReadTailStream({ call } as unknown as TuiRpcClient, 'term_1')
    await stream.refreshOnce()
    expect(stream.getState().connected).toBe(false)
  })
})
