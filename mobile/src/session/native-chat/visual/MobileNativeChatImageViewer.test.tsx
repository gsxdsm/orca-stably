import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { spacing } from '../../../theme/mobile-theme'
import { MobileNativeChatImageViewer } from './MobileNativeChatImageViewer'

const scene = vi.hoisted(() => ({
  insets: { top: 0, right: 84, bottom: 34, left: 0 }
}))

vi.mock('react-native', () => {
  class Value {
    interpolate(): number {
      return 1
    }
  }
  return {
    Animated: {
      Value,
      View: 'AnimatedView',
      timing: () => ({
        start: (done?: (result: { finished: boolean }) => void) => done?.({ finished: true }),
        stop() {}
      })
    },
    Easing: { bezier: () => () => 0 },
    Modal: 'Modal',
    Platform: { OS: 'ios' },
    Pressable: 'Pressable',
    StyleSheet: { create: (styles: unknown) => styles }
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
  MobilePanZoomImage: 'MobilePanZoomImage'
}))
vi.mock('../../../platform/use-reduced-motion', () => ({
  useReducedMotionEnabled: () => true
}))

function closeStyle(): { left?: number; right?: number; top?: number } {
  let renderer: ReactTestRenderer | undefined
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
    scene.insets = { top: 0, right: 84, bottom: 34, left: 0 }
  })

  it('sits on the left so it clears the Duo camera and Control Center', () => {
    const style = closeStyle()
    expect(style.left).toBe(spacing.lg)
    expect(style.right).toBeUndefined()
    expect(style.top).toBe(spacing.sm)
  })

  it('keeps the left inset when that side has the cutout', () => {
    scene.insets = { top: 12, right: 0, bottom: 21, left: 47 }
    const style = closeStyle()
    expect(style.left).toBe(47 + spacing.lg)
    expect(style.top).toBe(12 + spacing.sm)
  })
})
