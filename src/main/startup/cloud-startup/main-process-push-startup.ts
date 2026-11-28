import { getOrcaPushGatewayUrl } from '../../orca-profiles/cloud-auth/profile-cloud-auth-config'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import type { OrcaRuntimeRpcServer } from '../../runtime/rpc/server/runtime-rpc'
import { mainProcessState as state } from '../main-process-state'

// Push authenticates by host keypair, so accountless hosts must register phones too; shared startup state supplies the runtime in both modes.
export function startDesktopPushService(runtimeRpc: OrcaRuntimeRpcServer): void {
  const runtime: OrcaRuntimeService | null = state.core.runtime
  if (!runtime) {
    console.warn('[push] Background push startup skipped: runtime not started')
    return
  }
  void Promise.all([
    import('../../runtime/push/desktop-push-service'),
    import('../../notifications/execution-host-push-coverage')
  ])
    .then(([{ DesktopPushService }, { executionHostPushCoverage }]) => {
      if (state.isQuitting || state.core.runtime !== runtime) {
        return
      }
      const pushService = DesktopPushService.create({
        runtime,
        runtimeRpc,
        gatewayUrl: getOrcaPushGatewayUrl(),
        coverage: executionHostPushCoverage
      })
      pushService?.start()
      state.core.desktopPushService = pushService
    })
    .catch((error) => {
      console.warn(
        '[push] Background push startup unavailable:',
        error instanceof Error ? error.message : String(error)
      )
    })
}
