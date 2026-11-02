import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IMAGE_VIEWER_DISMISS_DISTANCE,
  IMAGE_VIEWER_DISMISS_VELOCITY
} from '../../../components/image-viewer-swipe'
import type { MobilePanZoomDismiss } from '../../../components/use-mobile-pan-zoom'
import { spacing } from '../../../theme/mobile-theme'
import { MobileNativeChatImageViewer } from './MobileNativeChatImageViewer'

const scene = vi.hoisted(() => ({
  width: 951,
  height: 669,
  insets: { top: 0, right: 84, bottom: 34, left: 0 },
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

function closeButton() {
  act(() => {
    renderer = create(
      createElement(MobileNativeChatImageViewer, {
        uri: 'file:///tmp/shot.png',
        label: 'shot',
        onClose: () => {}
      })
    )
  })
  return renderer!.root.findByProps({ accessibilityLabel: 'Close image' })
}

function closeStyle(): {
  left?: number
  right?: number
  top?: number
  width?: number
  height?: number
} {
  const button = closeButton()
  const style = button.props.style({ pressed: false })
  return Object.assign({}, ...[style].flat())
}

describe('MobileNativeChatImageViewer close button', () => {
  beforeEach(() => {
    scene.width = 951
    scene.height = 669
    scene.insets = { top: 0, right: 84, bottom: 34, left: 0 }
    scene.reduced = true
    seen.dismiss = null
  })

  it('stays on the right, clear of the inner status column', () => {
    const button = closeButton()
    const style = Object.assign({}, ...[button.props.style({ pressed: false })].flat()) as {
      left?: number
      right?: number
      top?: number
      width?: number
      height?: number
    }
    expect(button.props.hitSlop).toBeUndefined()
    expect(style.top).toBe(spacing.sm)
    expect(style.right).toBe(84 + spacing.lg)
    expect(style.width).toBe(44)
    expect(style.height).toBe(44)
    expect(style.left).toBeUndefined()
    const buttonRight = 951 - (style.right ?? 0)
    expect(buttonRight).toBeLessThan(867)
  })

  it('stays on the right when the cutout is on the left', () => {
    scene.width = 390
    scene.height = 844
    scene.insets = { top: 12, right: 0, bottom: 21, left: 47 }
    const style = closeStyle()
    expect(style.right).toBe(spacing.lg)
    expect(style.top).toBe(12 + spacing.sm)
    expect(style.left).toBeUndefined()
    expect(style.width).toBe(44)
  })

  it('stays off the folded cover camera and status column', () => {
    const glyph = { x: 399.67, y: 29.33, width: 37, height: 37 }
    const column = { x: 382, y: 0, width: 84, height: 174 }
    scene.width = 466
    scene.height = 678
    scene.insets = { top: 0, right: 84, bottom: 34, left: 0 }
    const style = closeStyle()
    expect(style.top).toBe(spacing.sm)
    expect(style.right).toBe(84 + spacing.lg)
    expect(style.width).toBe(44)
    const left = 466 - (style.right ?? 0) - (style.width ?? 0)
    const right = left + (style.width ?? 0)
    const bottom = (style.top ?? 0) + (style.height ?? 0)
    const hits = (region: { x: number; y: number; width: number; height: number }) =>
      left < region.x + region.width &&
      right > region.x &&
      (style.top ?? 0) < region.y + region.height &&
      bottom > region.y
    expect(hits(glyph)).toBe(false)
    expect(hits(column)).toBe(false)
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
