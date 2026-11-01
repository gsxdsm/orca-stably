import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IMAGE_VIEWER_DISMISS_DISTANCE,
  IMAGE_VIEWER_DISMISS_VELOCITY
} from '../../../components/image-viewer-swipe'
import type { MobilePanZoomDismiss } from '../../../components/use-mobile-pan-zoom'
import {
  DUO_RAIL_CONTROL_SIZE,
  DUO_STATUS_GLYPH_FROM_EDGE,
  DUO_STATUS_GLYPH_SIZE
} from '../../../layout/duo-status-row'
import { spacing } from '../../../theme/mobile-theme'
import { MobileNativeChatImageViewer } from './MobileNativeChatImageViewer'

const scene = vi.hoisted(() => ({
  width: 951,
  height: 669,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
  occlusions: [{ x: 867, y: 0, width: 84, height: 124 }] as {
    x: number
    y: number
    width: number
    height: number
  }[],
  reduced: true
}))
const seen = vi.hoisted(() => ({
  dismiss: null as MobilePanZoomDismiss | null
}))

vi.mock('react-native', () => {
  class Value {
    setValue(): void {}
    interpolate(): this {
      return this
    }
  }
  const animation = () => ({
    start: (done?: (result: { finished: boolean }) => void) => done?.({ finished: true }),
    stop() {}
  })
  return {
    Animated: {
      Value,
      View: 'AnimatedView',
      timing: animation,
      spring: animation,
      parallel: () => animation(),
      multiply: (left: unknown) => left
    },
    Easing: { bezier: () => () => 0 },
    Modal: 'Modal',
    Platform: { OS: 'ios' },
    Pressable: 'Pressable',
    StyleSheet: { create: (styles: unknown) => styles },
    useWindowDimensions: () => ({ width: scene.width, height: scene.height })
  }
})
vi.mock('../../../layout/reserved-regions', () => ({
  useReservedRegions: () => ({ divisions: [], occlusions: scene.occlusions })
}))
vi.mock('lucide-react-native', () => ({ X: 'X' }))
vi.mock('../../../layout/side-safe-area', () => ({
  useWindowSafeAreaInsets: () => scene.insets
}))
vi.mock('../../../theme/use-mobile-color-scheme', () => ({
  useMobileColorScheme: () => 'dark'
}))
vi.mock('../../../i18n/use-mobile-translation', () => ({
  useMobileTranslation: () => (_key: string, fallback: string) => fallback
}))
vi.mock('../../../components/MobilePanZoomImage', () => ({
  MobilePanZoomImage: (props: { dismiss?: MobilePanZoomDismiss | null }) => {
    seen.dismiss = props.dismiss ?? null
    return null
  }
}))
vi.mock('../../../platform/use-reduced-motion', () => ({
  useReducedMotionEnabled: () => scene.reduced
}))

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

function closeStyle(): {
  left?: number
  right?: number
  top?: number
  width?: number
  height?: number
} {
  act(() => {
    renderer = create(
      createElement(MobileNativeChatImageViewer, {
        uri: 'file:///tmp/shot.png',
        label: 'shot',
        onClose: () => {}
      })
    )
  })
  const button = renderer!.root.findByProps({ accessibilityLabel: 'Close image' })
  const style = button.props.style({ pressed: false })
  return Object.assign({}, ...[style].flat())
}

describe('MobileNativeChatImageViewer close button', () => {
  beforeEach(() => {
    scene.width = 951
    scene.height = 669
    scene.insets = { top: 0, right: 84, bottom: 34, left: 0 }
    scene.occlusions = [{ x: 867, y: 0, width: 84, height: 124 }]
    scene.reduced = true
    seen.dismiss = null
  })

  it('shares the Duo status row and stays out of the column', () => {
    const style = closeStyle()
    const rowTop =
      DUO_STATUS_GLYPH_FROM_EDGE + DUO_STATUS_GLYPH_SIZE / 2 - DUO_RAIL_CONTROL_SIZE / 2
    expect(style.top).toBe(rowTop + spacing.sm)
    expect(style.left).toBe(spacing.lg + spacing.sm)
    expect(style.width).toBe(DUO_RAIL_CONTROL_SIZE)
    expect(style.height).toBe(DUO_RAIL_CONTROL_SIZE)
    expect((style.left ?? 0) + (style.width ?? 0)).toBeLessThan(951 - 84)
    expect(style.right).toBeUndefined()
  })

  it('keeps the left inset when that side has the cutout', () => {
    scene.width = 390
    scene.height = 844
    scene.insets = { top: 12, right: 0, bottom: 21, left: 47 }
    scene.occlusions = []
    const style = closeStyle()
    expect(style.left).toBe(47 + spacing.lg)
    expect(style.top).toBe(12 + spacing.sm)
    expect(style.width).toBeUndefined()
  })

  it('stays off the cover camera, the status column, and the corner', () => {
    const glyph = { x: 399.67, y: 29.33, width: 37, height: 37 }
    scene.width = 466
    scene.height = 678
    scene.insets = { top: 0, right: 84, bottom: 34, left: 0 }
    scene.occlusions = [glyph, { x: 382, y: 0, width: 84, height: 174 }]
    const style = closeStyle()
    const rowTop = glyph.y + glyph.height / 2 - DUO_RAIL_CONTROL_SIZE / 2
    expect(style.top).toBe(rowTop + spacing.sm)
    expect(style.left).toBe(spacing.lg + spacing.sm)
    expect(style.width).toBe(DUO_RAIL_CONTROL_SIZE)
    const right = (style.left ?? 0) + (style.width ?? 0)
    const bottom = (style.top ?? 0) + (style.height ?? 0)
    expect(right).toBeLessThan(382)
    const hitsGlyph =
      (style.left ?? 0) < glyph.x + glyph.width &&
      right > glyph.x &&
      (style.top ?? 0) < glyph.y + glyph.height &&
      bottom > glyph.y
    expect(hitsGlyph).toBe(false)
  })
})

function render(onClose = vi.fn()): { onClose: ReturnType<typeof vi.fn> } {
  act(() => {
    renderer = create(
      createElement(MobileNativeChatImageViewer, {
        uri: 'file:///tmp/shot.png',
        label: 'shot',
        onClose
      })
    )
  })
  return { onClose }
}

describe('MobileNativeChatImageViewer swipe dismiss', () => {
  beforeEach(() => {
    scene.width = 390
    scene.height = 844
    scene.insets = { top: 12, right: 0, bottom: 21, left: 0 }
    scene.occlusions = []
    scene.reduced = false
    seen.dismiss = null
  })

  it('keeps the close button as the accessible way out', () => {
    const onClose = vi.fn()
    render(onClose)
    const button = renderer!.root.findByProps({ accessibilityLabel: 'Close image' })
    expect(button.props.accessibilityRole).toBe('button')
    act(() => {
      button.props.onPress()
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on a release past the distance or a flick, in any direction', () => {
    const { onClose } = render()
    act(() => {
      seen.dismiss?.onRelease(IMAGE_VIEWER_DISMISS_DISTANCE, 0, 0, 0)
    })
    expect(onClose).toHaveBeenCalledOnce()

    const upward = render()
    act(() => {
      seen.dismiss?.onRelease(0, -IMAGE_VIEWER_DISMISS_DISTANCE, 0, 0)
    })
    expect(upward.onClose).toHaveBeenCalledOnce()

    const sideways = render()
    act(() => {
      seen.dismiss?.onRelease(-IMAGE_VIEWER_DISMISS_DISTANCE, 0, 0, 0)
    })
    expect(sideways.onClose).toHaveBeenCalledOnce()

    const diagonal = IMAGE_VIEWER_DISMISS_DISTANCE / Math.SQRT2
    const across = render()
    act(() => {
      seen.dismiss?.onRelease(diagonal, diagonal, 0, 0)
    })
    expect(across.onClose).toHaveBeenCalledOnce()

    const flick = render()
    act(() => {
      seen.dismiss?.onRelease(24, 0, IMAGE_VIEWER_DISMISS_VELOCITY, 0)
    })
    expect(flick.onClose).toHaveBeenCalledOnce()
  })

  it('springs back when the finger stops short, including a flick back toward rest', () => {
    const { onClose } = render()
    act(() => {
      seen.dismiss?.onRelease(40, 0, 0, 0)
    })
    act(() => {
      seen.dismiss?.onRelease(220, 30, -IMAGE_VIEWER_DISMISS_VELOCITY * 3, 0)
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes under Reduce Motion, by fading rather than refusing the swipe', () => {
    scene.reduced = true
    const { onClose } = render()
    act(() => {
      seen.dismiss?.onRelease(0, -IMAGE_VIEWER_DISMISS_DISTANCE, 0, 0)
    })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
