import { useEffect, useRef } from 'react'
import { usePageBridgeClientIfPresent } from '../transport/connection/client-context.web'
import type { BackClaim } from './use-back-claim'
import type { InteractiveBackSwipe } from './back-swipe'

// Claim shell Back on empty/nonempty stack edges; RN Web cannot intercept it. Older shells keep native pop behavior.
export function useBackClaim(
  claim: BackClaim,
  beginBackSwipe?: (() => InteractiveBackSwipe | null) | null
): void {
  // Hold handler/client refs to avoid churn; one client lives for the document, and null outside its provider means nothing to claim.
  const client = usePageBridgeClientIfPresent()
  const latest = useRef({ claim, client, beginBackSwipe })
  // Refresh refs after commit before registration so discarded renders cannot change active behavior.
  useEffect(() => {
    latest.current = { claim, client, beginBackSwipe }
  })
  const claimed = claim !== null && client !== null

  useEffect(() => {
    if (!claimed) {
      return
    }
    return latest.current.client?.claimBack(
      Object.assign(() => latest.current.claim?.() ?? false, {
        beginBackSwipe: (edge: boolean) => {
          const begin = latest.current.beginBackSwipe
          if (begin) {
            return begin()
          }
          return edge
            ? {
                update: () => {},
                finish: (commit: boolean) => {
                  if (commit) {
                    latest.current.claim?.()
                  }
                },
                cancel: () => {}
              }
            : null
        }
      })
    )
  }, [claimed])
}
