import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { StyleSheet, View, useWindowDimensions, type HostInstance } from 'react-native'
import { useFocusEffect } from 'expo-router'
import {
  duoRailFreeBand,
  type DuoRailControlFrame,
  type DuoRailJumpFrames
} from '../layout/duo-status-row'
import { useReservedRegions } from '../layout/reserved-regions'
import { getSideRailStrip } from '../layout/side-rail-strip'
import { useWindowSafeAreaInsets } from '../layout/side-safe-area'
import { useDuoChatExpanded } from './duo-chat-width'
import { duoRailJumpPlacement } from './duo-rail-jump'
import {
  blurDuoRailFreeBand,
  focusDuoRailFreeBand,
  publishDuoRailFreeBand,
  releaseDuoRailFreeBand
} from './duo-rail-free-band'
import { useDuoRailBackShown } from './use-duo-rail-back-shown'
import { spacing } from '../theme/mobile-theme'
import { MobileNativeChatFloatingControls } from './native-chat/lower-region/MobileNativeChatFloatingControls'

type JumpActions = {
  showJumpToTail: boolean
  onJumpToTail: () => void
  showPreviousMessage?: boolean
  onJumpToPrevious?: (animated: boolean) => void
}

type JumpContextValue = {
  frames: DuoRailJumpFrames | null
  actions: JumpActions | null
  register: (actions: JumpActions | null) => void
  reportComposerTop: (top: number | null) => void
}

const DuoRailJumpContext = createContext<JumpContextValue | null>(null)

function sameActions(left: JumpActions | null, right: JumpActions | null): boolean {
  if (left === right) {
    return true
  }
  if (left === null || right === null) {
    return false
  }
  return (
    left.showJumpToTail === right.showJumpToTail &&
    left.showPreviousMessage === right.showPreviousMessage &&
    left.onJumpToTail === right.onJumpToTail &&
    left.onJumpToPrevious === right.onJumpToPrevious
  )
}

function useRailFrames(
  chatVisible: boolean,
  keyboardInset: number,
  composerTop: number | null,
  actions: JumpActions | null
): DuoRailJumpFrames | null {
  const expanded = useDuoChatExpanded()
  const { width, height } = useWindowDimensions()
  const insets = useWindowSafeAreaInsets()
  const { occlusions } = useReservedRegions()
  const backShown = useDuoRailBackShown()
  const strip = getSideRailStrip({
    windowWidth: width,
    windowHeight: height,
    insets,
    occlusions
  })
  const frames = duoRailJumpPlacement({
    chatVisible,
    expanded,
    strip,
    keyboardInset,
    composerTop,
    windowWidth: width,
    windowHeight: height,
    occlusions
  })
  const visibleJumpButtons =
    frames !== null && actions !== null
      ? (actions.showJumpToTail ? 1 : 0) + (actions.showPreviousMessage ? 1 : 0)
      : 0
  // Without the status occlusions (a folded Duo that reports no fold division) the page draws no
  // rail Back or arrows, so it frees everything above the composer; the shell places the top itself.
  const band =
    chatVisible && !expanded && !(keyboardInset > 0) && composerTop !== null
      ? strip !== null
        ? duoRailFreeBand({
            windowWidth: width,
            windowHeight: height,
            strip,
            occlusions,
            composerTop,
            backShown,
            visibleJumpButtons
          })
        : composerTop > spacing.sm
          ? { top: 0, bottom: composerTop - spacing.sm }
          : null
      : null
  const [owner] = useState(() => Symbol('duo-rail-free-band'))
  useEffect(() => {
    publishDuoRailFreeBand(owner, band)
  }, [owner, band?.top, band?.bottom])
  useEffect(() => () => releaseDuoRailFreeBand(owner), [owner])
  // Focus, not mount: the host stack keeps this chat mounted under any chat pushed over it.
  useFocusEffect(
    useCallback(() => {
      focusDuoRailFreeBand(owner)
      return () => blurDuoRailFreeBand(owner)
    }, [owner])
  )
  return frames
}

export function DuoRailJumpHost({
  chatVisible,
  keyboardInset,
  children
}: {
  chatVisible: boolean
  keyboardInset: number
  children: ReactNode
}) {
  const [composerTop, setComposerTop] = useState<number | null>(null)
  const [actions, setActions] = useState<JumpActions | null>(null)
  const reportComposerTop = useCallback((top: number | null) => {
    setComposerTop((prev) => {
      if (top === null) {
        return prev === null ? prev : null
      }
      return prev !== null && Math.abs(prev - top) < 0.5 ? prev : top
    })
  }, [])
  const frames = useRailFrames(chatVisible, keyboardInset, composerTop, actions)
  const register = useCallback((next: JumpActions | null) => {
    setActions((prev) => (sameActions(prev, next) ? prev : next))
  }, [])
  const value = useMemo(
    () => ({ frames, actions, register, reportComposerTop }),
    [frames, actions, register, reportComposerTop]
  )
  return <DuoRailJumpContext.Provider value={value}>{children}</DuoRailJumpContext.Provider>
}

/** Publishes the composer box top so rail arrows stay above it, including while the keyboard is up. */
export function DuoRailComposerTop({
  keyboardInset,
  hidden,
  children
}: {
  keyboardInset: number
  hidden?: boolean
  children: ReactNode
}) {
  const report = useContext(DuoRailJumpContext)?.reportComposerTop
  const { width, height } = useWindowDimensions()
  const ref = useRef<HostInstance>(null)
  const measure = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _width, height) => {
      if (height > 0) {
        report?.(y)
      }
    })
  }, [report])
  useEffect(() => {
    // display:none reports height 0, which measure ignores, so a hidden composer must drop the old top.
    if (hidden) {
      report?.(null)
      return
    }
    measure()
  }, [measure, report, keyboardInset, hidden, width, height])
  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={measure}
      style={hidden ? stylesHidden : undefined}
    >
      {children}
    </View>
  )
}

const stylesHidden = { display: 'none' } as const

function shiftRailFrame(
  frame: DuoRailControlFrame,
  originX: number,
  originY: number
): DuoRailControlFrame {
  return { top: frame.top - originY, left: frame.left - originX, size: frame.size }
}

export function DuoRailJumpOverlay() {
  const ctx = useContext(DuoRailJumpContext)
  const { width, height } = useWindowDimensions()
  const ref = useRef<HostInstance>(null)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })
  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) {
        setOrigin((prev) =>
          Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5 ? prev : { x, y }
        )
      }
    })
  }, [])
  useEffect(() => {
    measure()
  }, [measure, width, height, ctx?.frames])
  const localFrames = useMemo(
    () =>
      ctx?.frames == null
        ? null
        : {
            previous: shiftRailFrame(ctx.frames.previous, origin.x, origin.y),
            latest: shiftRailFrame(ctx.frames.latest, origin.x, origin.y)
          },
    [ctx?.frames, origin.x, origin.y]
  )
  return (
    // frames are in window coordinates, while this overlay sits inside the session pane (offset by the sidebar in Split View).
    <View
      ref={ref}
      collapsable={false}
      onLayout={measure}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      {localFrames != null && ctx?.actions != null ? (
        <MobileNativeChatFloatingControls {...ctx.actions} rail={localFrames} />
      ) : null}
    </View>
  )
}

/** In-transcript controls, unless the session host is drawing them in the rail. */
export function MobileNativeChatJumpControls(props: JumpActions) {
  const ctx = useContext(DuoRailJumpContext)
  useEffect(() => {
    ctx?.register(props)
    return () => ctx?.register(null)
  }, [
    ctx?.register,
    props.showJumpToTail,
    props.showPreviousMessage,
    props.onJumpToTail,
    props.onJumpToPrevious
  ])
  if (ctx?.frames != null) {
    return null
  }
  return <MobileNativeChatFloatingControls {...props} />
}
