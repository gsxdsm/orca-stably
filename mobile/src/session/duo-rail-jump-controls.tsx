import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import type { DuoRailJumpFrames } from '../layout/duo-status-row'
import { useReservedRegions } from '../layout/reserved-regions'
import { getSideRailStrip } from '../layout/side-rail-strip'
import { useWindowSafeAreaInsets } from '../layout/side-safe-area'
import { useDuoChatExpanded } from './duo-chat-width'
import { duoRailJumpPlacement } from './duo-rail-jump'
import { MobileNativeChatFloatingControls } from './native-chat/MobileNativeChatFloatingControls'

type JumpActions = {
  showJumpToTail: boolean
  onJumpToTail: () => void
  showPreviousMessage: boolean
  onJumpToPrevious: (animated: boolean) => void
}

type JumpContextValue = {
  frames: DuoRailJumpFrames | null
  actions: JumpActions | null
  register: (actions: JumpActions | null) => void
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

function useRailFrames(chatVisible: boolean, keyboardInset: number): DuoRailJumpFrames | null {
  const expanded = useDuoChatExpanded()
  const { width, height } = useWindowDimensions()
  const insets = useWindowSafeAreaInsets()
  const { occlusions } = useReservedRegions()
  const strip = getSideRailStrip({
    windowWidth: width,
    windowHeight: height,
    insets,
    occlusions
  })
  return duoRailJumpPlacement({
    chatVisible,
    expanded,
    strip,
    keyboardInset,
    windowWidth: width,
    windowHeight: height,
    occlusions
  })
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
  const frames = useRailFrames(chatVisible, keyboardInset)
  const [actions, setActions] = useState<JumpActions | null>(null)
  const register = useCallback((next: JumpActions | null) => {
    setActions((prev) => (sameActions(prev, next) ? prev : next))
  }, [])
  const value = useMemo(() => ({ frames, actions, register }), [frames, actions, register])
  return <DuoRailJumpContext.Provider value={value}>{children}</DuoRailJumpContext.Provider>
}

export function DuoRailJumpOverlay() {
  const ctx = useContext(DuoRailJumpContext)
  if (ctx?.frames == null || ctx.actions == null) {
    return null
  }
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <MobileNativeChatFloatingControls {...ctx.actions} rail={ctx.frames} />
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
