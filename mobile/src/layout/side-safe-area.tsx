import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaFrame,
  useSafeAreaInsets,
  type EdgeInsets
} from 'react-native-safe-area-context'
import {
  resolveSideRailWidth,
  SideRailAvailableContext,
  SideRailHost,
  useSideRailDrawnByScreen
} from './side-rail'
import { hostOs } from '../platform/host-os'
import { useSideRailTop } from './use-window-regions'

const WindowSafeAreaInsetsContext = createContext<EdgeInsets | null>(null)

// Pad side cutouts/navigation bars once, then expose the padded frame and insets so descendants neither pad twice nor size past it.
export function SideSafeArea({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const frame = useSafeAreaFrame()
  const areaInsets = useMemo(() => ({ ...insets, left: 0, right: 0 }), [insets])
  const areaFrame = useMemo(
    () => ({
      ...frame,
      x: frame.x + insets.left,
      width: Math.max(0, frame.width - insets.left - insets.right)
    }),
    [frame, insets.left, insets.right]
  )
  // iOS only: on Android a one-sided inset is a navigation bar or cutout, not the Duo's status column.
  const railWidth = hostOs() === 'ios' ? resolveSideRailWidth(insets) : 0
  // Subscribed for the boolean alone, so a screen republishing its rail does not re-render the app.
  const railDrawnByScreen = useSideRailDrawnByScreen()
  const showRailColumn = railWidth > 0 && !railDrawnByScreen
  // Below the status column when the platform measured it; otherwise from the top inset.
  const railTop = Math.max(insets.top, useSideRailTop() ?? 0)
  const area = (
    <WindowSafeAreaInsetsContext.Provider value={insets}>
      <SafeAreaFrameContext.Provider value={areaFrame}>
        <SafeAreaInsetsContext.Provider value={areaInsets}>
          <SideRailAvailableContext.Provider value={railWidth > 0}>
            {children}
          </SideRailAvailableContext.Provider>
        </SafeAreaInsetsContext.Provider>
      </SafeAreaFrameContext.Provider>
    </WindowSafeAreaInsetsContext.Provider>
  )
  // Native SafeAreaView measures its nearest native provider, so nest one inside the padding; web reads the adjusted context.
  // One tree shape whether or not the rail shows, so rotating never remounts the app.
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.area,
          {
            paddingLeft: insets.left,
            paddingRight: railWidth > 0 ? 0 : insets.right
          }
        ]}
      >
        {Platform.OS === 'web' ? area : <SafeAreaProvider>{area}</SafeAreaProvider>}
      </View>
      {showRailColumn ? (
        <View
          style={[
            styles.rail,
            {
              width: railWidth,
              paddingTop: railTop,
              paddingBottom: insets.bottom
            }
          ]}
        >
          <SideRailHost />
        </View>
      ) : null}
    </View>
  )
}

// Modals own a separate window outside SideSafeArea and need the original window insets.
export function useWindowSafeAreaInsets(): EdgeInsets {
  const insets = useSafeAreaInsets()
  return useContext(WindowSafeAreaInsetsContext) ?? insets
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  area: { flex: 1 },
  // Bottom-aligned: the status items sit at the top of the column.
  rail: { justifyContent: 'flex-end', alignItems: 'center' }
})
