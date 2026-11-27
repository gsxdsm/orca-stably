import type { ProviderRateLimits } from '../../../shared/agent-usage/rate-limits/rate-limit-types'

type Listener = (reading: ProviderRateLimits) => void

// The hook server and the usage service share one process; this hands readings between them.
let listener: Listener | null = null

export function setAntigravityStatusLineListener(next: Listener | null): void {
  listener = next
}

export function publishAntigravityStatusLineReading(reading: ProviderRateLimits): void {
  listener?.(reading)
}
