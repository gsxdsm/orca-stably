import { useEffect, useState } from 'react'
import {
  emptyCrew,
  type OrchestrationCrewSnapshot
} from '../../../../src/shared/orchestration-crew'
import { isPublicOrchestrationAddress } from '../../../../src/shared/orchestration-agent-reference'
import type { RpcClient } from '../../transport/rpc-client'
import { reduceCrewSubscription } from './mobile-orchestration-crew'

const HIDDEN = emptyCrew('unknown')
const RETRY_LIMIT = 3

export function useMobileOrchestrationCrew(
  client: RpcClient | null,
  party: string | null
): OrchestrationCrewSnapshot {
  const [snapshot, setSnapshot] = useState<OrchestrationCrewSnapshot>(HIDDEN)
  useEffect(() => {
    if (!client || !party || !isPublicOrchestrationAddress(party)) {
      setSnapshot(HIDDEN)
      return
    }
    let alive = true
    let pending: OrchestrationCrewSnapshot | null = null
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let stop = () => {}
    const listen = () => {
      stop = client.subscribe('orchestration.crewSubscribe', { party }, (value) => {
        if (!alive) {
          return
        }
        const step = reduceCrewSubscription(pending, value)
        if (step.kind === 'unsupported') {
          setSnapshot(HIDDEN)
          stop()
          return
        }
        if (step.kind === 'pending') {
          pending = step.pending
          return
        }
        if (step.kind === 'snapshot') {
          pending = null
          attempts = 0
          setSnapshot(step.snapshot)
          return
        }
        if (step.kind === 'ended') {
          pending = null
          stop()
          if (attempts >= RETRY_LIMIT) {
            return
          }
          attempts += 1
          timer = setTimeout(listen, attempts * 1000)
        }
      })
    }
    listen()
    return () => {
      alive = false
      clearTimeout(timer)
      stop()
    }
  }, [client, party])
  return snapshot
}
