import type { WorkspacePortScanResult } from '../../../shared/workspace-ports'

export type KeyedPortScan = { key: string; result: WorkspacePortScanResult }

export type PortScanDebounceState = {
  /** Last reachable scan (no unavailableReason) per scan key. */
  lastGood: Map<string, WorkspacePortScanResult>
  /** Consecutive failure count per scan key. */
  failures: Map<string, number>
}

export function createPortScanDebounceState(): PortScanDebounceState {
  return { lastGood: new Map(), failures: new Map() }
}

/**
 * Smooth transient per-host port-scan failures so a worktree's live-port
 * indicator stays solid across a single dropped poll.
 *
 * A reachable host reporting no ports has no `unavailableReason`, so it is
 * recorded as the new good state and a genuine port close clears immediately.
 * A failed scan (thrown error or `unavailableReason`) reuses the host's last
 * good scan until `tolerance` consecutive failures accumulate, after which the
 * unavailable result is surfaced. `state` is mutated in place; keys absent from
 * `results` are pruned so the maps stay bounded as hosts come and go.
 */
export function reconcileTransientPortScanFailures(
  results: KeyedPortScan[],
  state: PortScanDebounceState,
  tolerance: number
): KeyedPortScan[] {
  const { lastGood, failures } = state
  const activeKeys = new Set(results.map(({ key }) => key))
  // Prune state for hosts no longer present. Iterate each map independently — a
  // host that has only ever failed has a `failures` entry but no `lastGood`, so
  // walking `lastGood` alone would leak its counter and carry a stale streak if
  // the host reappears.
  for (const map of [lastGood, failures]) {
    for (const key of map.keys()) {
      if (!activeKeys.has(key)) {
        map.delete(key)
      }
    }
  }

  return results.map(({ key, result }) => {
    if (!result.unavailableReason) {
      lastGood.set(key, result)
      failures.delete(key)
      return { key, result }
    }
    const failureCount = (failures.get(key) ?? 0) + 1
    failures.set(key, failureCount)
    const previous = lastGood.get(key)
    if (failureCount < tolerance && previous) {
      return { key, result: previous }
    }
    return { key, result }
  })
}
