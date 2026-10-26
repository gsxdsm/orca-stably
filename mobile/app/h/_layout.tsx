import { useCallback, useEffect, useRef, useState } from 'react'
import { View, StyleSheet, PanResponder, Platform } from 'react-native'
import { useGlobalSearchParams, useNavigation, usePathname } from 'expo-router'
import { useSafeAreaFrame } from 'react-native-safe-area-context'
import { colors } from '../../src/theme/mobile-theme'
import { useResponsiveLayout } from '../../src/layout/responsive-layout'
import {
  HOST_SIDEBAR_DEFAULT_WIDTH,
  HOST_SIDEBAR_MAX_WIDTH,
  HOST_SIDEBAR_MIN_WIDTH,
  loadHostSidebarWidth,
  saveHostSidebarWidth
} from '../../src/storage/preferences'
import { HostProtocolGate } from '../../src/components/HostProtocolGate'
import { HostScreen } from '../../src/host-screen/HostScreen'
import { HostStack } from '../../src/navigation/host-stack'
import { HostSidebarRevealContext } from '../../src/layout/host-sidebar-reveal'
import { HostAreaServingContext } from '../../src/mobile-web-shell/host-area-serving'
import { usePageOwnsHostArea } from '../../src/mobile-web-shell/page-owns-host-area'
import { isOverlayPageRoute } from '../../src/new-workspace/overlay-page-route'
import { foldPosture, type FoldPosture } from '../../src/layout/fold-division'
import { useFoldDivision } from '../../src/layout/use-window-regions'
import { useWindowSafeAreaInsets } from '../../src/layout/side-safe-area'

// Keep at least this much room for the detail pane when resizing the sidebar.
const MIN_DETAIL_WIDTH = 320
const RESIZE_EDGE_WIDTH = 24

// Clamp restored sidebar width to current window so a smaller device retains usable detail space.
function clampSidebarToWindow(width: number, windowWidth: number): number {
  const hardMax = Math.max(
    HOST_SIDEBAR_MIN_WIDTH,
    Math.min(HOST_SIDEBAR_MAX_WIDTH, windowWidth - MIN_DETAIL_WIDTH)
  )
  return Math.min(hardMax, Math.max(HOST_SIDEBAR_MIN_WIDTH, Math.round(width)))
}

// Snaps the split to a book-style hinge when both panes still fit their minimums in the content area.
function resolveHingeSplit(
  posture: FoldPosture,
  leftInset: number,
  areaWidth: number
): { sidebarWidth: number; hingeWidth: number } | null {
  if (posture.kind !== 'sideBySide') {
    return null
  }
  const sidebarWidth = posture.leftEnd - leftInset
  const hingeWidth = posture.rightStart - posture.leftEnd
  const fits =
    sidebarWidth >= HOST_SIDEBAR_MIN_WIDTH &&
    areaWidth - sidebarWidth - hingeWidth >= MIN_DETAIL_WIDTH
  return fits ? { sidebarWidth, hingeWidth } : null
}

export default function HostGroupLayout() {
  // Wide layout = tablet/foldable canvas (see responsive-layout-metrics).
  const { isWideLayout } = useResponsiveLayout()
  const windowInsets = useWindowSafeAreaInsets()
  // The area beside the side rail, which is what the sidebar and detail actually share.
  const areaWidth = useSafeAreaFrame().width
  const { hostId } = useGlobalSearchParams<{ hostId?: string }>()
  const pathname = usePathname()
  const overlayRoute = isOverlayPageRoute(pathname)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(HOST_SIDEBAR_DEFAULT_WIDTH)

  // Refs keep once-created PanResponder handlers reading current widths.
  const widthRef = useRef(sidebarWidth)
  widthRef.current = sidebarWidth
  const areaWidthRef = useRef(areaWidth)
  areaWidthRef.current = areaWidth
  const dragStartRef = useRef(sidebarWidth)
  const shownWidthRef = useRef(sidebarWidth)
  const overrideHingeRef = useRef<() => void>(() => {})

  useEffect(() => {
    let stale = false
    void loadHostSidebarWidth().then((saved) => {
      if (!stale) {
        setSidebarWidth(clampSidebarToWindow(saved, areaWidthRef.current))
      }
    })
    return () => {
      stale = true
    }
  }, [])

  // Re-clamp on fold/rotation/split-screen to preserve MIN_DETAIL_WIDTH.
  useEffect(() => {
    setSidebarWidth((current) => clampSidebarToWindow(current, areaWidth))
  }, [areaWidth])

  const hideSidebar = useCallback(() => setSidebarOpen(false), [])
  const revealSidebar = useCallback(() => setSidebarOpen(true), [])
  const [hostAreaServing, setHostAreaServing] = useState(false)
  const pageOwnsHostArea = usePageOwnsHostArea()
  // One owner: the page only with its init fact; natively all but a host route its page is serving.
  const sidebarDrawnHere =
    Platform.OS === 'web' ? pageOwnsHostArea : !(pathname === `/h/${hostId}` && hostAreaServing)
  const showSidebar = isWideLayout && !!hostId && sidebarDrawnHere
  const detailHasContent = !!hostId && pathname !== `/h/${hostId}`
  const canCollapseSidebar = showSidebar && detailHasContent
  // Only a visible sidebar has a resize edge for swipe-back to steal; collapsed, swipe-back returns.
  const sidebarShown = showSidebar && sidebarOpen

  // Base host detail is a placeholder; hiding its sidebar would leave nothing useful.
  useEffect(() => {
    if (showSidebar && !detailHasContent) {
      setSidebarOpen(true)
    }
  }, [detailHasContent, showSidebar])

  // Use an overlaid leaf drag handle: Android ScrollView/FlatList captures touches before a parent PanResponder.
  // Claim start/capture because nothing lies beneath the handle; keep it off the sidebar container.
  const resizer = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        // A drag takes over from a hinge snap, starting from the width on screen.
        dragStartRef.current = shownWidthRef.current
        overrideHingeRef.current()
      },
      onPanResponderMove: (_evt, g) => {
        setSidebarWidth(clampSidebarToWindow(dragStartRef.current + g.dx, areaWidthRef.current))
      },
      onPanResponderRelease: () => {
        void saveHostSidebarWidth(widthRef.current)
      },
      onPanResponderTerminate: () => {
        void saveHostSidebarWidth(widthRef.current)
      }
    })
  ).current

  // Half folded book-style, the panes meet at the hinge until the user drags the edge.
  const hingeSplit = resolveHingeSplit(foldPosture(useFoldDivision()), windowInsets.left, areaWidth)
  const hingeKey = hingeSplit ? `${hingeSplit.sidebarWidth}:${hingeSplit.hingeWidth}` : null
  const [hingeOverridden, setHingeOverridden] = useState(false)
  useEffect(() => setHingeOverridden(false), [hingeKey])
  overrideHingeRef.current = () => setHingeOverridden(true)
  const snappedToHinge = hingeSplit !== null && !hingeOverridden
  const shownSidebarWidth = snappedToHinge ? hingeSplit.sidebarWidth : sidebarWidth
  shownWidthRef.current = shownSidebarWidth

  // Why: on iOS 26 a rightward drag anywhere can pop the root stack, so resizing the sidebar went back to Home.
  const navigation = useNavigation()
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !sidebarShown })
  }, [navigation, sidebarShown])

  // Keep detail Stack at a stable tree position so fold/rotation cannot remount navigation.
  return (
    <HostProtocolGate hostId={hostId} transparentWhilePending={overlayRoute}>
      <View style={[styles.row, overlayRoute && styles.transparent]}>
        {showSidebar && sidebarOpen ? (
          <View style={[styles.sidebar, { width: shownSidebarWidth }]}>
            <HostScreen
              embedded
              hostId={hostId}
              onHideSidebar={canCollapseSidebar ? hideSidebar : undefined}
            />
            {/* Edge drag handle captures Android gestures above the list. */}
            <View style={styles.resizeHandle} {...resizer.panHandlers} />
          </View>
        ) : null}
        <View
          style={[
            styles.detail,
            showSidebar && sidebarOpen && snappedToHinge && { paddingLeft: hingeSplit.hingeWidth }
          ]}
        >
          <HostAreaServingContext.Provider value={setHostAreaServing}>
            <HostSidebarRevealContext.Provider
              value={showSidebar && !sidebarOpen ? revealSidebar : null}
            >
              {/* Why: the detail pane's swipe-back edge is the sidebar resize handle; a drag there popped the screen. */}
              <HostStack
                animation={showSidebar ? 'none' : 'default'}
                gestureEnabled={!sidebarShown}
              />
            </HostSidebarRevealContext.Provider>
          </HostAreaServingContext.Provider>
        </View>
      </View>
    </HostProtocolGate>
  )
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.bgBase
  },
  transparent: {
    backgroundColor: 'transparent'
  },
  sidebar: {
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle
  },
  // Elevated edge strip must sit above list to own Android drags.
  resizeHandle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: RESIZE_EDGE_WIDTH,
    zIndex: 20,
    elevation: 20
  },
  detail: {
    flex: 1,
    minWidth: 0
  }
})
