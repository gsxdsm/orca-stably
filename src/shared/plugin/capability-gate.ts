// The capability gate — pure, electron-free, and shared by BOTH the Electron
// main host services and the relay host services so a security decision cannot
// land on desktop while drifting on the remote/mobile path. Holds no I/O: only
// the allow/deny decisions, host-command validation, and snapshot projection.
// A conformance test runs the same cases against both service impls.

import {
  BRIDGE_METHOD_CAPABILITY,
  HOST_COMMANDS,
  isBridgeMethod,
  isHostCommand,
  WORKSPACE_SNAPSHOT_KEYS,
  type BridgeErrorCode,
  type WorkspaceSnapshot
} from './api-contract'
import type { PluginCapability } from './manifest'

export type GateDecision = { granted: true } | { granted: false; error: BridgeErrorCode }

// Decide whether a plugin that declared `declared` may call `method`. Unknown
// methods are denied as `unknown_method`; undeclared capabilities as
// `capability_denied`. Deny-by-default: an empty declared list grants nothing.
export function gateBridgeMethod(
  declared: readonly PluginCapability[],
  method: string
): GateDecision {
  if (!isBridgeMethod(method)) {
    return { granted: false, error: 'unknown_method' }
  }
  const required = BRIDGE_METHOD_CAPABILITY[method]
  return declared.includes(required)
    ? { granted: true }
    : { granted: false, error: 'capability_denied' }
}

export type HostCommandCheck = { ok: true } | { ok: false; error: BridgeErrorCode }

// Validate an allowlisted host command and its params. `open-external-url` is
// restricted to http(s) so a plugin cannot drive the host into opening
// arbitrary schemes (file:, etc.).
export function validateHostCommand(name: unknown, params: unknown): HostCommandCheck {
  if (!isHostCommand(name)) {
    return { ok: false, error: 'unknown_method' }
  }
  if (name === 'open-external-url') {
    const url =
      typeof params === 'object' && params !== null ? (params as { url?: unknown }).url : params
    if (typeof url !== 'string' || !isHttpUrl(url)) {
      return { ok: false, error: 'invalid_params' }
    }
  }
  if (name === 'copy-to-clipboard') {
    const text =
      typeof params === 'object' && params !== null ? (params as { text?: unknown }).text : params
    if (typeof text !== 'string') {
      return { ok: false, error: 'invalid_params' }
    }
  }
  return { ok: true }
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// Project an arbitrary host-produced object down to exactly the bounded
// `WorkspaceSnapshot` keys, dropping anything a service impl might leak (paths,
// remotes, credentials). The output never carries extra keys.
export function projectWorkspaceSnapshot(raw: unknown): WorkspaceSnapshot {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const branch = source.currentBranch
  return {
    workspaceName: typeof source.workspaceName === 'string' ? source.workspaceName : '',
    currentBranch: typeof branch === 'string' ? branch : null,
    isDirty: source.isDirty === true,
    openFileCount:
      typeof source.openFileCount === 'number' && Number.isFinite(source.openFileCount)
        ? source.openFileCount
        : 0
  }
}

// Re-exported so callers can assert/iterate the allowlist + projected keys
// without reaching back into the contract module.
export { HOST_COMMANDS, WORKSPACE_SNAPSHOT_KEYS }
