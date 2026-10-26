import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import type { EdgeInsets } from 'react-native-safe-area-context'
import { useWindowSafeAreaInsets } from '../layout/side-safe-area'
import {
  SIDE_RAIL_DRAWN_BY_SCREEN,
  useSideRailAvailable,
  useSideRailContent
} from '../layout/side-rail'

/**
 * Hands the window's side rail to the page: the root gives this screen the rail's column and the
 * page is told the real right inset, so its own `SideSafeArea` draws the rail. A page built before
 * the rail pads that inset instead, which is the layout it had when the root padded it.
 */
export function useShellSideRailInsets(insets: EdgeInsets, active: boolean): EdgeInsets {
  const available = useSideRailAvailable()
  const windowInsets = useWindowSafeAreaInsets()
  const [focused, setFocused] = useState(true)
  // Why: a shell left mounted under a pushed native screen must give the column back.
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, [])
  )
  const claimed = available && active && focused
  useSideRailContent(claimed ? SIDE_RAIL_DRAWN_BY_SCREEN : null)
  return claimed ? { ...insets, right: windowInsets.right } : insets
}
