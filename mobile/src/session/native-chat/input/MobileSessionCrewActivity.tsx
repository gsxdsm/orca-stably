import { lazy, Suspense } from 'react'
import type { OrchestrationCrewRow } from '../../../../../src/shared/orchestration-crew'
import { mobileCrewVisible } from '../../orchestration-crew/mobile-orchestration-crew'
import { useMobileOrchestrationCrew } from '../../orchestration-crew/use-mobile-orchestration-crew'
import type { RpcClient } from '../../../transport/rpc-client'

// Load the sheet only when a pill is shown. It pulls Reanimated, which chat tests do not mock.
const MobileOrchestrationCrewBar = lazy(() =>
  import('./MobileOrchestrationCrewBar').then((mod) => ({
    default: mod.MobileOrchestrationCrewBar
  }))
)

/** Crew pill for the current chat or terminal agent. Null when this host has no relations. */
export function MobileSessionCrewActivity({
  client,
  party,
  onMention
}: {
  client: RpcClient | null
  party: string | null
  onMention: (row: OrchestrationCrewRow) => void
}): React.JSX.Element | null {
  const snapshot = useMobileOrchestrationCrew(client, party)
  if (!mobileCrewVisible(snapshot)) {
    return null
  }
  return (
    <Suspense fallback={null}>
      <MobileOrchestrationCrewBar client={client} party={party} onMention={onMention} />
    </Suspense>
  )
}
