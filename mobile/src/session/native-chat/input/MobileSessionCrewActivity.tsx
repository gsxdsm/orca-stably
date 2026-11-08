import { lazy, Suspense, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { RpcClient } from '../../../transport/rpc/rpc-client-contract'
import {
  appendCrewMention,
  mobileCrewParty,
  mobileCrewVisible
} from '../../orchestration-crew/mobile-orchestration-crew'
import { useMobileOrchestrationCrew } from '../../orchestration-crew/use-mobile-orchestration-crew'

// Load the sheet only when a pill is shown. It pulls Reanimated, which chat tests do not mock.
const MobileOrchestrationCrewBar = lazy(() =>
  import('./MobileOrchestrationCrewBar').then((mod) => ({
    default: mod.MobileOrchestrationCrewBar
  }))
)

/** Crew pill for the current chat or terminal agent. Null when this host has no relations. */
export function MobileSessionCrewActivity({
  client,
  sessionId,
  terminal,
  setComposerText
}: {
  client: RpcClient | null
  sessionId: string | null
  terminal?: string | null
  setComposerText: Dispatch<SetStateAction<string>>
}): React.JSX.Element | null {
  const party = mobileCrewParty(
    terminal
      ? { type: 'terminal', terminal, sessionId }
      : sessionId
        ? { type: 'agent-session', sessionId }
        : null
  )
  const snapshot = useMobileOrchestrationCrew(client, party)
  const mention = useCallback(
    (row: Parameters<typeof appendCrewMention>[1]) => {
      setComposerText((draft) => appendCrewMention(draft, row))
    },
    [setComposerText]
  )
  if (!mobileCrewVisible(snapshot)) {
    return null
  }
  return (
    <Suspense fallback={null}>
      <MobileOrchestrationCrewBar snapshot={snapshot} embedded onMention={mention} />
    </Suspense>
  )
}
