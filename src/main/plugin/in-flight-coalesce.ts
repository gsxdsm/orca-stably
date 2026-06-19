// Share one in-flight async result per key so concurrent callers don't duplicate
// the underlying work. Used to coalesce concurrent plugin activations for the
// same id, which would otherwise race the relay's non-atomic bundle swap. Pure +
// state-passed-in (the Map is owned by the caller) so it is unit-testable.

export function coalesceByKey<T>(
  map: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>
): Promise<T> {
  const existing = map.get(key)
  if (existing) {
    return existing
  }
  const created = factory()
  map.set(key, created)
  // Clear the entry once settled so a later call re-runs the factory; guard
  // against deleting a newer entry that replaced this one for the same key. The
  // trailing catch swallows only this bookkeeping chain's rejection — the
  // caller still receives `created` and observes its real outcome.
  void created
    .finally(() => {
      if (map.get(key) === created) {
        map.delete(key)
      }
    })
    .catch(() => {})
  return created
}
