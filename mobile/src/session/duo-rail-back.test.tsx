import { createElement, type ReactElement } from 'react'
import { Pressable } from 'react-native'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSideRailStrip } from '../layout/side-rail-strip'
import { DuoRailBackButton } from './DuoRailBackButton'
import { duoRailBackVisible, performSessionRailBack } from './duo-rail-back'
import { useSessionRailBack } from './use-duo-rail-back.web'

const scene = vi.hoisted(() => ({
  width: 951,
  height: 669,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
  occlusions: [{ x: 867, y: 0, width: 84, height: 124 }],
  expanded: false,
  pressBack: null as (() => boolean) | null
}))

vi.mock('react-native', () => ({
  View: 'View',
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: scene.width, height: scene.height })
}))
vi.mock('lucide-react-native', () => ({ ChevronLeft: 'ChevronLeft' }))
vi.mock('../layout/side-safe-area', () => ({
  useWindowSafeAreaInsets: () => scene.insets
}))
vi.mock('../layout/reserved-regions', () => ({
  useReservedRegions: () => ({ divisions: [], occlusions: scene.occlusions })
}))
vi.mock('./duo-chat-width', () => ({
  useDuoChatExpanded: () => scene.expanded
}))
vi.mock('../transport/client-context.web', () => ({
  usePageBridgeClientIfPresent: () =>
    scene.pressBack === null ? null : { pressBack: scene.pressBack }
}))

const RIGHT_RAIL = {
  windowWidth: 951,
  windowHeight: 669,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
  occlusions: [{ x: 867, y: 0, width: 84, height: 124 }]
}

function resetScene(): void {
  scene.width = RIGHT_RAIL.windowWidth
  scene.height = RIGHT_RAIL.windowHeight
  scene.insets = { ...RIGHT_RAIL.insets }
  scene.occlusions = RIGHT_RAIL.occlusions.map((region) => ({ ...region }))
  scene.expanded = false
  scene.pressBack = null
}

function mount(element: ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined
  act(() => {
    renderer = create(element)
  })
  if (renderer === undefined) {
    throw new Error('renderer did not mount')
  }
  return renderer
}

function hostNamed(type: unknown, name: string): boolean {
  return typeof type === 'string' && type === name
}

function backs(root: ReactTestRenderer) {
  return root.root.findAll(
    (node) =>
      hostNamed(node.type, 'Pressable') && node.props.accessibilityLabel === 'Back to worktrees'
  )
}

function railSlot(root: ReactTestRenderer) {
  return backs(root)[0]?.parent?.parent
}

function PageProbe({ nativeBack }: { nativeBack: () => void }) {
  const onBack = useSessionRailBack(nativeBack)
  return createElement(Pressable, { accessibilityLabel: 'probe', onPress: onBack })
}

describe('the Duo rail back button', () => {
  beforeEach(resetScene)

  it('shows only while chat is collapsed beside a status column', () => {
    const strip = getSideRailStrip(RIGHT_RAIL)
    expect(duoRailBackVisible({ chatVisible: true, expanded: false, strip })).toBe(true)
    expect(duoRailBackVisible({ chatVisible: true, expanded: true, strip })).toBe(false)
    expect(duoRailBackVisible({ chatVisible: false, expanded: false, strip })).toBe(false)
    expect(duoRailBackVisible({ chatVisible: true, expanded: false, strip: null })).toBe(false)

    const onBack = vi.fn()
    const collapsed = mount(createElement(DuoRailBackButton, { chatVisible: true, onBack }))
    const button = backs(collapsed)
    expect(button).toHaveLength(1)
    expect(railSlot(collapsed)?.props.style).toMatchObject({
      top: 124,
      width: 84,
      right: 0,
      paddingTop: 8
    })
    act(() => {
      button[0]?.props.onPress()
    })
    expect(onBack).toHaveBeenCalledTimes(1)

    scene.expanded = true
    expect(
      backs(mount(createElement(DuoRailBackButton, { chatVisible: true, onBack })))
    ).toHaveLength(0)

    scene.expanded = false
    scene.insets = { top: 0, right: 0, bottom: 34, left: 0 }
    scene.occlusions = []
    expect(
      backs(mount(createElement(DuoRailBackButton, { chatVisible: true, onBack })))
    ).toHaveLength(0)

    resetScene()
    expect(
      backs(mount(createElement(DuoRailBackButton, { chatVisible: false, onBack })))
    ).toHaveLength(0)
  })

  it('follows the rail to the left and keeps the header chevron', () => {
    scene.insets = { top: 0, right: 0, bottom: 34, left: 84 }
    scene.occlusions = [{ x: 0, y: 545, width: 84, height: 124 }]
    const left = mount(createElement(DuoRailBackButton, { chatVisible: true, onBack: vi.fn() }))
    expect(railSlot(left)?.props.style).toMatchObject({ left: 0, width: 84 })
    expect(left.root.findAll((node) => hostNamed(node.type, 'ChevronLeft'))).toHaveLength(1)
  })

  it('presses through the page Back claim, and the session back when the page cannot', () => {
    const nativeBack = vi.fn()
    const pageBack = vi.fn(() => true)
    performSessionRailBack(pageBack, nativeBack)
    expect(pageBack).toHaveBeenCalledTimes(1)
    expect(nativeBack).not.toHaveBeenCalled()
    performSessionRailBack(() => false, nativeBack)
    performSessionRailBack(null, nativeBack)
    expect(nativeBack).toHaveBeenCalledTimes(2)

    const took = vi.fn()
    scene.pressBack = vi.fn(() => true)
    const claimed = mount(createElement(PageProbe, { nativeBack: took }))
    act(() => {
      claimed.root.findByProps({ accessibilityLabel: 'probe' }).props.onPress()
    })
    expect(scene.pressBack).toHaveBeenCalledTimes(1)
    expect(took).not.toHaveBeenCalled()

    scene.pressBack = vi.fn(() => false)
    const missed = mount(createElement(PageProbe, { nativeBack: took }))
    act(() => {
      missed.root.findByProps({ accessibilityLabel: 'probe' }).props.onPress()
    })
    expect(took).toHaveBeenCalledTimes(1)

    scene.pressBack = null
    const native = mount(createElement(PageProbe, { nativeBack: took }))
    act(() => {
      native.root.findByProps({ accessibilityLabel: 'probe' }).props.onPress()
    })
    expect(took).toHaveBeenCalledTimes(2)
  })
})
