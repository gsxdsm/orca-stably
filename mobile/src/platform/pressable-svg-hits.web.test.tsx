// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', async () => {
  const actual = await vi.importActual<typeof import('react-native')>('react-native-web')
  return actual
})

import { Pressable, View } from 'react-native'
import { startIgnoringPressableIconHits } from './pressable-svg-hits.web'

function icon(name: string) {
  return createElement('svg', { 'data-icon': name }, createElement('path', { d: 'M1 1' }))
}

describe('page pressable icon hits', () => {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    document.getElementById('orca-pressable-svg-hits')?.remove()
  })

  it('lets a click on an icon path reach the button, and leaves a deep drawing hittable', async () => {
    startIgnoringPressableIconHits()
    const onPress = vi.fn()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <>
          <Pressable accessibilityLabel="Back" onPress={onPress}>
            {icon('back')}
          </Pressable>
          <Pressable accessibilityLabel="Diagram">
            <View>
              <View>
                <View>{icon('diagram')}</View>
              </View>
            </View>
          </Pressable>
        </>
      )
    })
    const button = container.querySelector('[aria-label="Back"]')
    const path = button?.querySelector('path')
    const diagram = container.querySelector('[data-icon="diagram"]')
    if (!(button instanceof HTMLElement) || !(path instanceof SVGPathElement)) {
      throw new Error('back icon is missing')
    }
    if (!(diagram instanceof SVGElement)) {
      throw new Error('diagram is missing')
    }
    expect(getComputedStyle(path).pointerEvents).toBe('none')
    expect(getComputedStyle(diagram).pointerEvents).not.toBe('none')
    await act(async () => {
      path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
