import { useSyncExternalStore } from 'react'
import { useWindowDimensions } from 'react-native'
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core'
import type { FoldDivision } from './fold-division'
import { sideRailTopFromOcclusions, type WindowRect } from './window-regions'

type WindowRegions = { division: FoldDivision | null; occlusions: readonly WindowRect[] }

type WindowRegionsModule = {
  addListener: (event: 'onChange', listener: (payload: WindowRegions) => void) => EventSubscription
}

// Optional: a build without the module (or an SDK older than iOS 27.1) reports nothing.
const nativeWindowRegions = requireOptionalNativeModule<WindowRegionsModule>('OrcaWindowRegions')

const NONE: WindowRegions = { division: null, occlusions: [] }
let regions = NONE
let subscription: EventSubscription | null = null
const listeners = new Set<() => void>()

// One native listener for every reader, held while any reader is mounted.
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  subscription ??=
    nativeWindowRegions?.addListener('onChange', (payload) => {
      regions = { division: payload.division ?? null, occlusions: payload.occlusions ?? [] }
      for (const notify of listeners) {
        notify()
      }
    }) ?? null
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      subscription?.remove()
      subscription = null
      regions = NONE
    }
  }
}

function useWindowRegions(): WindowRegions {
  return useSyncExternalStore(subscribe, () => regions)
}

export function useFoldDivision(): FoldDivision | null {
  return useWindowRegions().division
}

export function useSideRailTop(): number | null {
  const { occlusions } = useWindowRegions()
  const { width } = useWindowDimensions()
  return sideRailTopFromOcclusions(occlusions, width)
}
