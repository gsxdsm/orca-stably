// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { StackRouter } from 'expo-router/build/react-navigation/routers/StackRouter'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPageBackConsumers, type PageBackConsumer } from './page-back-consumers'
import { useRouteHandoff } from '../../../navigation/route-handoff.web'

const navigation = vi.hoisted(() => ({
  router: { canGoBack: (): boolean => false, back: () => {} },
  client: {
    claimBack:
      (_consumer: PageBackConsumer): (() => void) =>
      () => {},
    getShellSession: () => null
  }
}))
vi.mock('expo-router', () => ({
  useRouter: () => navigation.router,
  usePathname: () => '/h/host/session/workspace'
}))
vi.mock('../../../transport/connection/client-context.web', () => ({
  usePageBridgeClient: () => navigation.client,
  usePageBridgeClientIfPresent: () => navigation.client
}))

const cleanup: (() => void)[] = []
beforeEach(() => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' })
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 400 })
})
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose())
  document.body.replaceChildren()
})

function touch(
  type: string,
  x: number,
  time: number,
  y = 100,
  target: Element = document.body
): void {
  const point = { identifier: 1, clientX: x, clientY: y }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    touches: { value: type === 'touchend' ? [] : [point] },
    changedTouches: { value: [point] },
    timeStamp: { value: time }
  })
  target.dispatchEvent(event)
}

it('keeps navigation unchanged during drag and cancellation, then commits one back after release', () => {
  const history = ['host', 'session']
  const progress: number[] = []
  const back = createPageBackConsumers({ publishClaim: () => {}, onUnclaimed: () => {} })
  cleanup.push(back.clear)
  back.claim(
    Object.assign(() => true, {
      beginBackSwipe: () => ({
        update: (value: number) => progress.push(value),
        finish: (commit: boolean) => {
          if (commit) {
            history.pop()
          }
        },
        cancel: () => {}
      })
    })
  )
  touch('touchstart', 200, 0)
  touch('touchmove', 260, 200)
  expect(progress).toEqual([0.15])
  expect(history).toEqual(['host', 'session'])
  touch('touchmove', 220, 300)
  touch('touchend', 220, 500)
  expect(history).toEqual(['host', 'session'])
  touch('touchstart', 100, 600)
  touch('touchmove', 320, 900)
  expect(progress).toEqual([0.15, 0.05, 0.55])
  expect(history).toEqual(['host', 'session'])
  touch('touchend', 320, 1100)
  expect(history).toEqual(['host'])
})

it('cancels an in-flight swipe when a sheet claims Back and never falls through its claim', () => {
  let cancelled = 0
  let committed = 0
  const back = createPageBackConsumers({ publishClaim: () => {}, onUnclaimed: () => {} })
  cleanup.push(back.clear)
  back.claim(
    Object.assign(() => true, {
      beginBackSwipe: () => ({
        update: () => {},
        finish: () => {
          committed++
        },
        cancel: () => {
          cancelled++
        }
      })
    })
  )
  touch('touchstart', 100, 0)
  touch('touchmove', 300, 200)
  const closeSheet = back.claim(() => true)
  expect(cancelled).toBe(1)
  touch('touchend', 300, 400)
  touch('touchstart', 100, 500)
  touch('touchmove', 330, 700)
  touch('touchend', 330, 900)
  expect(committed).toBe(0)
  closeSheet()
  touch('touchstart', 100, 1000)
  touch('touchmove', 110, 1200, 200)
  touch('touchmove', 330, 1300, 200)
  touch('touchend', 330, 1400)
  expect(committed).toBe(0)
})

it('never starts from excluded chrome such as the tab bar, even at the edge', () => {
  let started = 0
  const back = createPageBackConsumers({ publishClaim: () => {}, onUnclaimed: () => {} })
  cleanup.push(back.clear)
  back.claim(
    Object.assign(() => true, {
      beginBackSwipe: () => {
        started++
        return null
      }
    })
  )
  const bar = document.createElement('div')
  bar.dataset.backSwipe = 'disabled'
  const cell = bar.appendChild(document.createElement('div'))
  document.body.append(bar)
  for (const x of [10, 200]) {
    touch('touchstart', x, 0, 100, cell)
    touch('touchmove', x + 150, 100, 100, cell)
    touch('touchend', x + 150, 200, 100, cell)
  }
  expect(started).toBe(0)
  touch('touchstart', 10, 300)
  touch('touchmove', 160, 400)
  expect(started).toBe(1)
})

it('leaves Android touch navigation to its hardware Back handler', () => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Android' })
  let started = false
  const back = createPageBackConsumers({ publishClaim: () => {}, onUnclaimed: () => {} })
  cleanup.push(back.clear)
  back.claim(
    Object.assign(() => true, {
      beginBackSwipe: () => {
        started = true
        return null
      }
    })
  )
  touch('touchstart', 100, 0)
  touch('touchmove', 300, 200)
  touch('touchend', 300, 400)
  expect(started).toBe(false)
})

it('never commits a drag after the app leaves or the touch is cancelled', () => {
  let cancelled = 0
  let committed = 0
  const back = createPageBackConsumers({ publishClaim: () => {}, onUnclaimed: () => {} })
  cleanup.push(back.clear)
  back.claim(
    Object.assign(() => true, {
      beginBackSwipe: () => ({
        update: () => {},
        finish: () => {
          committed++
        },
        cancel: () => {
          cancelled++
        }
      })
    })
  )
  touch('touchstart', 20, 0)
  touch('touchmove', 300, 200)
  window.dispatchEvent(new Event('pagehide'))
  touch('touchend', 300, 400)
  expect(cancelled).toBe(1)
  expect(committed).toBe(0)
  touch('touchstart', 20, 500)
  touch('touchmove', 300, 700)
  touch('touchcancel', 300, 800)
  touch('touchend', 300, 900)
  expect(cancelled).toBe(2)
  expect(committed).toBe(0)
})

it('keeps the stack gesture owner when nested components mount navigation facades', async () => {
  const router = StackRouter({})
  let state: Parameters<typeof router.getStateForAction>[0] = {
    stale: false,
    type: 'stack',
    key: 'host-stack',
    routeKeySeq: 2,
    index: 1,
    routeNames: ['host', 'session'],
    routes: [
      { key: 'host', name: 'host' },
      { key: 'session', name: 'session' }
    ]
  }
  const pop = () => {
    const result = router.getStateForAction(
      state,
      { type: 'POP', payload: { count: 1 } },
      {
        routeNames: ['host', 'session'],
        routeGetIdList: {}
      }
    )
    if (typeof result !== 'string') {
      state = result.state
    }
  }
  let progress = 0
  const back = createPageBackConsumers({ publishClaim: () => {}, onUnclaimed: () => {} })
  cleanup.push(back.clear)
  navigation.router = { canGoBack: () => state.index > 0, back: pop }
  navigation.client.claimBack = back.claim
  back.claim(
    Object.assign(
      () => {
        pop()
        return true
      },
      {
        beginBackSwipe: () => ({
          update: (value: number) => {
            progress = value
          },
          finish: (commit: boolean) => {
            if (commit) {
              pop()
            }
          },
          cancel: () => {}
        })
      }
    )
  )
  function NavigationReaders() {
    useRouteHandoff()
    useRouteHandoff()
    return null
  }
  await act(() => {
    const view = create(createElement(NavigationReaders))
    cleanup.push(() => {
      act(() => view.unmount())
    })
  })
  touch('touchstart', 100, 0)
  touch('touchmove', 200, 200)
  expect(progress).toBe(0.25)
  expect(state.routes.map((route) => route.name)).toEqual(['host', 'session'])
  touch('touchend', 200, 400)
  expect(state.routes.map((route) => route.name)).toEqual(['host', 'session'])
  touch('touchstart', 20, 500)
  touch('touchmove', 260, 800)
  expect(state.routes.map((route) => route.name)).toEqual(['host', 'session'])
  touch('touchend', 260, 1000)
  expect(state.routes.map((route) => route.name)).toEqual(['host'])
})
