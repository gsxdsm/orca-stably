import type { AcpLaunchSpec } from './acp-launch-contract'

/** The saved model the launch line carries, if this spec launches with that model. */
export function acpLaunchLineModel(
  spec: Pick<AcpLaunchSpec, 'launchesWithModel'>,
  saved: string | undefined
): string | undefined {
  const carries = spec.launchesWithModel
  return saved && (carries === true || (typeof carries === 'function' && carries(saved)))
    ? saved
    : undefined
}
