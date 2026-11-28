import type { ProviderRateLimits } from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import type { NetworkProxySettings } from '../../../../shared/network/network-proxy'
import type { ClaudeRuntimeAuthPreparation } from '../../../claude-accounts/runtime-auth/runtime-auth-types'

/** A hash of the token the usage server rejected, never the token itself. */
export type ClaudeRejectedToken = { fingerprint: string; error: unknown; rejectedAt: number }

export type ClaudeRateLimitFetchOptions = {
  authPreparation?: ClaudeRuntimeAuthPreparation
  allowPtyFallback?: boolean
  allowUsagePanelSupplement?: boolean
  networkProxySettings?: NetworkProxySettings
  /** By login home; a token listed here is re-sent at most hourly. */
  rejectedTokensByHome?: Map<string, ClaudeRejectedToken>
  signal?: AbortSignal
}

export type ClaudeManagedAccountUsageOptions = {
  allowUsagePanelSupplement?: boolean
  networkProxySettings?: NetworkProxySettings
  /** One cycle's reads by login home, so accounts sharing a login are read once. */
  readsByHome?: Map<string, Promise<ProviderRateLimits>>
  rejectedTokensByHome?: Map<string, ClaudeRejectedToken>
  signal?: AbortSignal
}
