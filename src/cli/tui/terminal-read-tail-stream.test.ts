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
    const result = reads[Math.min(index, reads.length - 1)]
    index += 1
    return { result }
  })
  return { client: { call } as unknown as TuiRpcClient, call }
}

describe('TerminalReadTailStream', () => {
  it('appends only new lines across cursor-paged reads (no duplication)', async () => {
    const { client } = clientReturning([
      read({ tail: ['line 1', 'line 2'], nextCursor: 'c1' }),
      read({ tail: ['line 3'], nextCursor: 'c2' })
    ])
    const stream = new TerminalReadTailStream(client, 'term_1')
    await stream.refreshOnce()
    await stream.refreshOnce()
    expect(stream.getState().lines).toEqual(['line 1', 'line 2', 'line 3'])
  })

  it('passes the prior nextCursor on the following read', async () => {
    const { client, call } = clientReturning([
      read({ tail: ['a'], nextCursor: 'cursor-42' }),
      read({ tail: ['b'], nextCursor: 'cursor-43' })
    ])
    const stream = new TerminalReadTailStream(client, 'term_1')
    await stream.refreshOnce()
    await stream.refreshOnce()
    expect(call.mock.calls[0][1]).toMatchObject({ terminal: 'term_1', cursor: undefined })
    expect(call.mock.calls[1][1]).toMatchObject({ cursor: 'cursor-42' })
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

  it('marks disconnected when the read fails', async () => {
    const call = vi.fn(async () => {
      throw new Error('socket closed')
    })
    const stream = new TerminalReadTailStream({ call } as unknown as TuiRpcClient, 'term_1')
    await stream.refreshOnce()
    expect(stream.getState().connected).toBe(false)
  })
})
