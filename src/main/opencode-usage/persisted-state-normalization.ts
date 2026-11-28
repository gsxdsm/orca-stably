import type { OpenCodeUsagePersistedState } from './types'
import {
  normalizeDailyAggregateCost,
  normalizeOpenCodeUsagePersistedDatabases,
  normalizeSessionCost
} from './persisted-database-normalization'

// Invalidate older caches: merge migrated rows per column, normalize input and preserve cache writes.
const SCHEMA_VERSION = 7

export function getDefaultState(): OpenCodeUsagePersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    worktreeFingerprint: null,
    processedDatabases: [],
    sessions: [],
    dailyAggregates: [],
    scanState: {
      enabled: false,
      lastScanStartedAt: null,
      lastScanCompletedAt: null,
      lastScanError: null
    }
  }
}

export function normalizePersistedState(
  state: OpenCodeUsagePersistedState
): OpenCodeUsagePersistedState {
  if (state.schemaVersion !== SCHEMA_VERSION) {
    const defaults = getDefaultState()
    return {
      ...defaults,
      scanState: { ...defaults.scanState, enabled: state.scanState?.enabled ?? false }
    }
  }
  return {
    ...state,
    processedDatabases: normalizeOpenCodeUsagePersistedDatabases(state.processedDatabases),
    sessions: state.sessions.map(normalizeSessionCost),
    dailyAggregates: state.dailyAggregates.map(normalizeDailyAggregateCost)
  }
}
