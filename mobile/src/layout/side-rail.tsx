import {
  createContext,
  Fragment,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode
} from 'react'
import type { EdgeInsets } from 'react-native-safe-area-context'

// A one-sided side inset at least this wide holds a column of 44pt buttons beside the status items.
const SIDE_RAIL_MIN_EXTRA_INSET = 44

/**
 * Width of the right side rail: the iPhone Duo's inner screen held sideways moves the status bar
 * into a right-hand column, an inset with no counterpart on the left. Symmetric landscape insets
 * (the sensor housing on other iPhones) leave nothing to fill.
 */
export function resolveSideRailWidth(insets: Pick<EdgeInsets, 'left' | 'right'>): number {
  return insets.right - insets.left >= SIDE_RAIL_MIN_EXTRA_INSET ? insets.right : 0
}

/** Published instead of content by a screen that draws the rail itself (the web shell's page). */
export const SIDE_RAIL_DRAWN_BY_SCREEN = Symbol('side-rail-drawn-by-screen')

type RailContent = ReactNode | typeof SIDE_RAIL_DRAWN_BY_SCREEN

const sections = new Map<symbol, RailContent>()
const listeners = new Set<() => void>()
let snapshot: { content: ReactNode[]; drawnByScreen: boolean } = {
  content: [],
  drawnByScreen: false
}

function publish(): void {
  const published = [...sections.values()]
  const drawnByScreen = published.includes(SIDE_RAIL_DRAWN_BY_SCREEN)
  snapshot = {
    content: drawnByScreen
      ? []
      : published.flatMap((content) =>
          content === SIDE_RAIL_DRAWN_BY_SCREEN || content === null ? [] : [content]
        ),
    drawnByScreen
  }
  for (const listener of listeners) {
    listener()
  }
}

function setSection(owner: symbol, content: RailContent | null): void {
  if (content !== null) {
    sections.set(owner, content)
  } else if (!sections.delete(owner)) {
    return
  }
  publish()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getRailContent(): ReactNode[] {
  return snapshot.content
}

function getRailDrawnByScreen(): boolean {
  return snapshot.drawnByScreen
}

export const SideRailAvailableContext = createContext(false)

/** True when the window has a side rail for screen actions to move into. */
export function useSideRailAvailable(): boolean {
  return useContext(SideRailAvailableContext)
}

/**
 * Shows `content` in the side rail while the caller is mounted; null withdraws it. Content renders
 * at the app root, outside the caller's React context, so it must be driven by props alone.
 * `SIDE_RAIL_DRAWN_BY_SCREEN` hands the rail's column to the caller to draw in itself.
 */
export function useSideRailContent(content: RailContent | null): void {
  const owner = useRef(Symbol('side-rail-owner')).current
  // No dependency list: content is rebuilt every render, and only the rail host re-renders on a set.
  useLayoutEffect(() => {
    setSection(owner, content)
  })
  useLayoutEffect(() => () => setSection(owner, null), [owner])
}

/** True while the focused screen draws the rail itself, so the root gives it the column. */
export function useSideRailDrawnByScreen(): boolean {
  return useSyncExternalStore(subscribe, getRailDrawnByScreen, getRailDrawnByScreen)
}

/** Renders what the focused screens published, top to bottom. */
export function SideRailHost(): ReactNode {
  const content = useSyncExternalStore(subscribe, getRailContent, getRailContent)
  return content.map((section, index) => <Fragment key={index}>{section}</Fragment>)
}
