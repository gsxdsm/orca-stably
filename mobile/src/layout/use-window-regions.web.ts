import { useSyncExternalStore } from 'react'
import { usePageBridgeClientIfPresent } from '../transport/client-context.web'
import type { FoldDivision } from './fold-division'

const noSubscription = (): (() => void) => () => undefined
const none = (): null => null

/** The page reads the hinge the shell measured; a shell too old to send one reads as flat. */
export function useFoldDivision(): FoldDivision | null {
  const client = usePageBridgeClientIfPresent()
  return useSyncExternalStore(
    client ? client.onWindowRegionsUpdate : noSubscription,
    client ? () => client.getShellSession()?.foldDivision ?? null : none
  )
}

/** Where the shell measured the side rail can start; null from a shell too old to send it. */
export function useSideRailTop(): number | null {
  const client = usePageBridgeClientIfPresent()
  return useSyncExternalStore(
    client ? client.onWindowRegionsUpdate : noSubscription,
    client ? () => client.getShellSession()?.sideRailTop ?? null : none
  )
}
