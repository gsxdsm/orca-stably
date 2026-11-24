// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createPageBackConsumers } from './page-back-consumers'

const cleanup: (() => void)[] = []
beforeEach(() => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' })
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 400 })
})
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose())
  document.body.replaceChildren()
})

function touch(type: string, x: number, time: number, y = 100): void {
  const point = { identifier: 1, clientX: x, clientY: y }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    touches: { value: type === 'touchend' ? [] : [point] },
    changedTouches: { value: [point] },
    timeStamp: { value: time }
  })
  document.body.dispatchEvent(event)
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
