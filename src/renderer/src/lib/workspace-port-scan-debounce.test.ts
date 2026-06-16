import { describe, it, expect } from 'vitest'
import {
  createPortScanDebounceState,
  reconcileTransientPortScanFailures
} from './workspace-port-scan-debounce'
import type { WorkspacePortScanResult } from '../../../shared/workspace-ports'

function good(portIds: string[]): WorkspacePortScanResult {
  return {
    platform: 'unknown',
    scannedAt: 1,
    ports: portIds.map((id) => ({ id, port: Number(id.split(':')[1] ?? 0) }) as never)
  }
}

function unavailable(): WorkspacePortScanResult {
  return { platform: 'unknown', scannedAt: 1, ports: [], unavailableReason: 'scan failed' }
}

const TOLERANCE = 2

describe('reconcileTransientPortScanFailures', () => {
  it('keeps the live indicator solid through a single transient failure', () => {
    const state = createPortScanDebounceState()

    const first = reconcileTransientPortScanFailures(
      [{ key: 'host:all', result: good(['tcp:3000']) }],
      state,
      TOLERANCE
    )
    expect(first[0].result.ports).toHaveLength(1)

    // First failure: reuse last good ports (no flicker to zero).
    const second = reconcileTransientPortScanFailures(
      [{ key: 'host:all', result: unavailable() }],
      state,
      TOLERANCE
    )
    expect(second[0].result.ports).toHaveLength(1)
    expect(second[0].result.unavailableReason).toBeUndefined()
  })

  it('drops ports only after failures reach the tolerance', () => {
    const state = createPortScanDebounceState()
    reconcileTransientPortScanFailures(
      [{ key: 'h:all', result: good(['tcp:3000']) }],
      state,
      TOLERANCE
    )
    reconcileTransientPortScanFailures([{ key: 'h:all', result: unavailable() }], state, TOLERANCE)

    // Second consecutive failure crosses tolerance -> surface unavailable.
    const third = reconcileTransientPortScanFailures(
      [{ key: 'h:all', result: unavailable() }],
      state,
      TOLERANCE
    )
    expect(third[0].result.ports).toHaveLength(0)
    expect(third[0].result.unavailableReason).toBe('scan failed')
  })

  it('clears immediately when a reachable host reports zero ports', () => {
    const state = createPortScanDebounceState()
    reconcileTransientPortScanFailures(
      [{ key: 'h:all', result: good(['tcp:3000']) }],
      state,
      TOLERANCE
    )

    // Reachable scan with no ports is the real state -> no debounce.
    const next = reconcileTransientPortScanFailures(
      [{ key: 'h:all', result: good([]) }],
      state,
      TOLERANCE
    )
    expect(next[0].result.ports).toHaveLength(0)
    expect(next[0].result.unavailableReason).toBeUndefined()
  })

  it('resets the failure streak after a successful scan', () => {
    const state = createPortScanDebounceState()
    reconcileTransientPortScanFailures(
      [{ key: 'h:all', result: good(['tcp:3000']) }],
      state,
      TOLERANCE
    )
    reconcileTransientPortScanFailures([{ key: 'h:all', result: unavailable() }], state, TOLERANCE)
    reconcileTransientPortScanFailures(
      [{ key: 'h:all', result: good(['tcp:3000']) }],
      state,
      TOLERANCE
    )

    // One failure after recovery should again be tolerated, not dropped.
    const afterRecovery = reconcileTransientPortScanFailures(
      [{ key: 'h:all', result: unavailable() }],
      state,
      TOLERANCE
    )
    expect(afterRecovery[0].result.ports).toHaveLength(1)
  })

  it('isolates failures per host so a stable host stays solid', () => {
    const state = createPortScanDebounceState()
    reconcileTransientPortScanFailures(
      [
        { key: 'local:all', result: good(['tcp:3000']) },
        { key: 'remote:all', result: good(['tcp:8080']) }
      ],
      state,
      TOLERANCE
    )

    const next = reconcileTransientPortScanFailures(
      [
        { key: 'local:all', result: good(['tcp:3000']) },
        { key: 'remote:all', result: unavailable() }
      ],
      state,
      TOLERANCE
    )
    expect(next.find((r) => r.key === 'local:all')?.result.ports).toHaveLength(1)
    expect(next.find((r) => r.key === 'remote:all')?.result.ports).toHaveLength(1)
  })

  it('prunes state for hosts that disappear', () => {
    const state = createPortScanDebounceState()
    reconcileTransientPortScanFailures(
      [{ key: 'gone:all', result: good(['tcp:3000']) }],
      state,
      TOLERANCE
    )
    reconcileTransientPortScanFailures(
      [{ key: 'other:all', result: good(['tcp:4000']) }],
      state,
      TOLERANCE
    )
    expect(state.lastGood.has('gone:all')).toBe(false)
    expect(state.lastGood.has('other:all')).toBe(true)
  })
})
