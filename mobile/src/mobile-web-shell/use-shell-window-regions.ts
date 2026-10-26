import { useEffect } from 'react'
import { useFoldDivision, useSideRailTop } from '../layout/use-window-regions'
import type { BridgeFoldDivision } from './bridge/bridge-fold-division'

export type ShellWindowRegions = {
  readonly foldDivision: BridgeFoldDivision | null
  readonly sideRailTop: number | null
}

/** The hinge and status column the shell reads natively; the page cannot see either. */
export function useShellWindowRegions(): ShellWindowRegions {
  return { foldDivision: useFoldDivision(), sideRailTop: useSideRailTop() }
}

/** Hands moved regions to the page on the same lane as the insets. */
export function usePublishedWindowRegions(
  bridge: {
    publishFoldDivision: (division: BridgeFoldDivision | null) => void
    publishSideRailTop: (top: number | null) => void
  },
  { foldDivision, sideRailTop }: ShellWindowRegions
): void {
  const { publishFoldDivision, publishSideRailTop } = bridge
  useEffect(() => {
    publishFoldDivision(foldDivision)
  }, [publishFoldDivision, foldDivision])
  useEffect(() => {
    publishSideRailTop(sideRailTop)
  }, [publishSideRailTop, sideRailTop])
}
