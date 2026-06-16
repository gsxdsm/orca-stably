import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Pressable, StyleSheet, PanResponder } from 'react-native'
import { Stack, useGlobalSearchParams } from 'expo-router'
import { PanelLeftOpen } from 'lucide-react-native'
import { colors, radii } from '../../src/theme/mobile-theme'
import { useResponsiveLayout } from '../../src/layout/responsive-layout'
import {
  HOST_SIDEBAR_DEFAULT_WIDTH,
  HOST_SIDEBAR_MAX_WIDTH,
  HOST_SIDEBAR_MIN_WIDTH,
  loadHostSidebarWidth,
  saveHostSidebarWidth
} from '../../src/storage/preferences'
import { HostScreen } from './[hostId]/index'

// Keep at least this much room for the detail pane when resizing the sidebar.
const MIN_DETAIL_WIDTH = 320

// Clamp a sidebar width to the bounds and to the current window, so a width
// saved on a larger device can't starve the detail pane on a narrower one.
function clampSidebarToWindow(width: number, windowWidth: number): number {
  const hardMax = Math.max(
    HOST_SIDEBAR_MIN_WIDTH,
    Math.min(HOST_SIDEBAR_MAX_WIDTH, windowWidth - MIN_DETAIL_WIDTH)
  )
  return Math.min(hardMax, Math.max(HOST_SIDEBAR_MIN_WIDTH, Math.round(width)))
}

function HostStack({ animation }: { animation: 'none' | 'default' }) {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgBase },
        // In the tablet split view the detail pane should swap instantly like
        // a desktop master-detail; the default slide animates the outgoing
        // screen and briefly reveals the one beneath it. Phones keep the slide.
        animation
      }}
    >
      <Stack.Screen name="[hostId]/index" options={{ title: 'Host' }} />
      <Stack.Screen name="[hostId]/accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="[hostId]/tasks" options={{ title: 'Tasks' }} />
      <Stack.Screen name="[hostId]/session/[worktreeId]" options={{ title: 'Terminal' }} />
      <Stack.Screen
        name="[hostId]/source-control/[worktreeId]"
        options={{ title: 'Source Control' }}
      />
      <Stack.Screen name="[hostId]/review/[worktreeId]" options={{ title: 'Review Changes' }} />
    </Stack>
  )
}

export default function HostGroupLayout() {
  // Wide layout = tablet/foldable canvas (see responsive-layout-metrics).
  const { isWideLayout, width: windowWidth } = useResponsiveLayout()
  const { hostId, action } = useGlobalSearchParams<{ hostId?: string; action?: string }>()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(HOST_SIDEBAR_DEFAULT_WIDTH)

  // Refs keep the once-created PanResponder reading live values without
  // re-creating its handlers on every width/window change.
  const widthRef = useRef(sidebarWidth)
  widthRef.current = sidebarWidth
  const windowWidthRef = useRef(windowWidth)
  windowWidthRef.current = windowWidth
  const dragStartRef = useRef(sidebarWidth)

  // Restore the user's last sidebar width, clamped to the current window.
  useEffect(() => {
    let stale = false
    void loadHostSidebarWidth().then((saved) => {
      if (!stale) {
        setSidebarWidth(clampSidebarToWindow(saved, windowWidthRef.current))
      }
    })
    return () => {
      stale = true
    }
  }, [])

  // Re-clamp when the window shrinks (fold, rotation, split-screen) so the
  // detail pane keeps at least MIN_DETAIL_WIDTH.
  useEffect(() => {
    setSidebarWidth((current) => clampSidebarToWindow(current, windowWidth))
  }, [windowWidth])

  const hideSidebar = useCallback(() => setSidebarOpen(false), [])
  const showSidebar = isWideLayout && !!hostId

  const resizer = useRef(
    PanResponder.create({
      // Let taps fall through to the list rows/buttons; only claim the gesture
      // once it's clearly a horizontal drag.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, g) =>
        Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStartRef.current = widthRef.current
      },
      onPanResponderMove: (_evt, g) => {
        setSidebarWidth(clampSidebarToWindow(dragStartRef.current + g.dx, windowWidthRef.current))
      },
      onPanResponderRelease: () => {
        void saveHostSidebarWidth(widthRef.current)
      },
      onPanResponderTerminate: () => {
        void saveHostSidebarWidth(widthRef.current)
      }
    })
  ).current

  // The detail Stack stays at a stable position in the tree across width
  // changes so a fold/rotation doesn't remount the navigator and reset the
  // navigation stack — only the sidebar pane toggles in and out.
  return (
    <View style={styles.row}>
      {showSidebar && sidebarOpen ? (
        <View style={[styles.sidebar, { width: sidebarWidth }]}>
          <HostScreen embedded hostId={hostId} action={action} onHideSidebar={hideSidebar} />
          {/* Drag the right edge to resize; the grip marks the affordance. */}
          <View style={styles.resizeHandle} {...resizer.panHandlers}>
            <View style={styles.resizeGrip} />
          </View>
        </View>
      ) : null}
      <View style={styles.detail}>
        <HostStack animation={showSidebar ? 'none' : 'default'} />
      </View>
      {/* Rendered last (and elevated) so the reveal control reliably paints
          above the detail pane on Android when the sidebar is hidden. */}
      {showSidebar && !sidebarOpen ? (
        <Pressable
          style={styles.revealTab}
          onPress={() => setSidebarOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Show sidebar"
          hitSlop={12}
        >
          <PanelLeftOpen size={20} color={colors.textPrimary} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.bgBase
  },
  sidebar: {
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle
  },
  detail: {
    flex: 1,
    minWidth: 0
  },
  // Full-height grab strip over the sidebar's right edge. Tap-transparent
  // (see PanResponder) so it only resizes on a horizontal drag.
  resizeHandle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 16
  },
  resizeGrip: {
    width: 4,
    height: 48,
    borderRadius: 2,
    backgroundColor: colors.borderSubtle
  },
  // When the sidebar is hidden, a pull tab floats over the detail pane's left
  // edge (mid-height to avoid the screen's own header) to reveal it again.
  revealTab: {
    position: 'absolute',
    top: '50%',
    left: 0,
    marginTop: -32,
    zIndex: 10,
    elevation: 12,
    width: 30,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgRaised,
    borderTopRightRadius: radii.card,
    borderBottomRightRadius: radii.card,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: colors.borderSubtle
  }
})
