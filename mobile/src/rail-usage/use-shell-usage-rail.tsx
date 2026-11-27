import { useMemo } from 'react'
import { useSideRailContent, useSideRailStrip } from '../layout/side-rail'
import { HostRailUsageStack } from './RailUsageStack'

/** Fills the Duo side rail with the host's usage rings while `shown` and the window has a rail. */
export function useShellUsageRail(hostId: string, shown: boolean): void {
  const hasStrip = useSideRailStrip() !== null
  const node = useMemo(
    () => (shown && hasStrip ? <HostRailUsageStack hostId={hostId} /> : null),
    [shown, hasStrip, hostId]
  )
  useSideRailContent(node)
}
