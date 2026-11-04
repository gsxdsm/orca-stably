import { hasUsageData } from '../../../src/shared/usage-provider-windows'
import {
  ProviderRateLimitsSchema,
  type AccountsSnapshot,
  type ProviderRateLimits
} from './accounts-snapshot'

/** Every other provider the host reports usage for, in the host's order. Claude and Codex have their own sections. */
export function getOtherUsageProviders(snapshot: AccountsSnapshot): ProviderRateLimits[] {
  const providers: ProviderRateLimits[] = []
  for (const [slot, value] of Object.entries(snapshot.rateLimits)) {
    if (slot === 'claude' || slot === 'codex') {
      continue
    }
    const parsed = ProviderRateLimitsSchema.safeParse(value)
    // Hidden or signed-out providers come back idle or unavailable with no windows.
    if (parsed.success && (hasUsageData(parsed.data) || parsed.data.status === 'error')) {
      providers.push(parsed.data)
    }
  }
  return providers
}
