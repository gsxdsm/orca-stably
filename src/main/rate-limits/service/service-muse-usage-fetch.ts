import type { ProviderRateLimits } from '../../../shared/agent-usage/rate-limits/rate-limit-types'
import { settleSiblingProviderFetch } from './service-sibling-provider-result'

export function prepareMuseUsageFetch(
  signal: AbortSignal,
  enabled: boolean,
  previous: ProviderRateLimits
) {
  return settleSiblingProviderFetch(
    enabled
      ? import('../providers/muse/muse-usage-fetcher').then(({ fetchMuseRateLimits }) =>
          fetchMuseRateLimits({ signal })
        )
      : Promise.resolve(previous)
  )
}
