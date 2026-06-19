// Type guards for streaming-subscription result frames. Extracted from
// rpc-client so the transport module stays under its line budget.

export function isTerminalSubscribedResult(
  value: unknown
): value is { type: 'subscribed'; streamId: number } {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'subscribed' &&
    typeof (value as { streamId?: unknown }).streamId === 'number'
  )
}

export function isBrowserScreencastReadyResult(
  value: unknown
): value is { type: 'ready'; subscriptionId: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'ready' &&
    typeof (value as { subscriptionId?: unknown }).subscriptionId === 'string'
  )
}
