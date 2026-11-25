import { describe, expect, it } from 'vitest'
import { pageHoldsSideStrip } from './side-strip-holder'

const HOST_AREA_GRANTS = ['navigate', 'storage', 'terminalKeyRail', 'sideStripCover']

describe('pageHoldsSideStrip', () => {
  it('gives the strip to a worker session the host page opened, whatever location it reported', () => {
    // A bot's worker session opens standalone inside the host document.
    const worker = {
      ownsHostArea: true,
      routeGrants: HOST_AREA_GRANTS,
      location: '/h/mac/session/repo%3A%3A%2Fwt%2Ffork-split?standalone=1'
    }
    expect(pageHoldsSideStrip({ ...worker, covered: true })).toBe(true)
    expect(pageHoldsSideStrip({ ...worker, location: '/h/mac', covered: true })).toBe(true)
    expect(pageHoldsSideStrip({ ...worker, location: null, covered: true })).toBe(true)
    // Pages that predate the cover report fall back to the session location.
    expect(pageHoldsSideStrip({ ...worker, covered: null })).toBe(true)
  })

  it('leaves the strip to the rings on the host list despite its union of route grants', () => {
    const hostList = { ownsHostArea: true, routeGrants: HOST_AREA_GRANTS, location: '/h/mac' }
    expect(pageHoldsSideStrip({ ...hostList, covered: false })).toBe(false)
    expect(pageHoldsSideStrip({ ...hostList, covered: null })).toBe(false)
  })

  it('keeps the strip for a session route opened as its own screen', () => {
    expect(
      pageHoldsSideStrip({
        ownsHostArea: false,
        routeGrants: ['terminalKeyRail'],
        covered: false,
        location: null
      })
    ).toBe(true)
  })
})
