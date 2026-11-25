import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import type { AccountsSnapshot } from '../accounts/accounts-snapshot'
import { useSideRailContent, useSideRailStrip } from '../layout/side-rail'
import type { BridgeSideStripFree } from '../mobile-web-shell/bridge/page-geometry/bridge-side-strip-cover'
import { HostRailUsageStack, RailUsageStack } from './RailUsageStack'
import { RailUsageSpan } from './RailUsageSpan'

/**
 * Fills the Duo side rail with the host's usage rings while the window has a rail: across all of it
 * (`whole`), within one span of it in window points, or not at all (null).
 */
export function useShellUsageRail(
  hostId: string,
  room: 'whole' | BridgeSideStripFree | null
): void {
  const hasStrip = useSideRailStrip() !== null
  const top = room === null || room === 'whole' ? null : room.top
  const bottom = room === null || room === 'whole' ? null : room.bottom
  const shown = room !== null
  const node = useMemo(
    () =>
      shown && hasStrip ? (
        top === null || bottom === null ? (
          <HostRailUsageStack hostId={hostId} />
        ) : (
          <RailUsageSpan span={{ top, bottom }}>
            <HostRailUsageStack hostId={hostId} />
          </RailUsageSpan>
        )
      ) : null,
    [shown, hasStrip, hostId, top, bottom]
  )
  useSideRailContent(node)
}

/** Fills the rail with `snapshot`'s usage rings while this screen is focused; for list screens that leave the rail free. */
export function useFocusedUsageRail(snapshot: AccountsSnapshot | null): void {
  const hasStrip = useSideRailStrip() !== null
  // Focus rather than mount: the stack keeps this screen mounted under whatever is pushed over it.
  const [focused, setFocused] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, [])
  )
  const node = useMemo(
    () =>
      focused && hasStrip && snapshot !== null ? <RailUsageStack snapshot={snapshot} /> : null,
    [focused, hasStrip, snapshot]
  )
  useSideRailContent(node)
}
