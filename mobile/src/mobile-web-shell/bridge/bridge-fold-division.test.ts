import { afterEach, describe, expect, it } from 'vitest'
import { createFakeBridgePortPair as createPair } from './bridge-port-pair-test-harness'
import { readBridgeHostMessage } from './bridge-envelope'
import { createBridgeInitFrame } from './bridge-init-frame'
import { readShellSession } from './bridge-client-session'

const resources = new Set<ReturnType<typeof createPair>>()
function createFakeBridgePortPair(
  ...args: Parameters<typeof createPair>
): ReturnType<typeof createPair> {
  const resource = createPair(...args)
  resources.add(resource)
  return resource
}
function closeResources(): void {
  for (const resource of resources) {
    resource.client.close()
    resource.host.dispose()
  }
  resources.clear()
}

const HINGE = { x: 0, y: 320, width: 951, height: 28 }

function initFrame(foldDivision?: typeof HINGE | null) {
  return createBridgeInitFrame({
    sessionId: 'session-a',
    buildId: 'build-a',
    connection: {
      state: 'connected',
      reconnectAttempt: 0,
      lastConnectedAt: null,
      lastInboundAt: null,
      generation: null
    },
    route: { pathname: '/h/host-a' },
    pageRoutes: ['/h/[hostId]'],
    granted: [],
    host: { id: 'host-a', name: 'Host A', endpoint: 'ws://host-a', lastConnected: 0 },
    storage: {},
    ...(foldDivision === undefined ? {} : { foldDivision })
  })
}

function readInit(json: string) {
  const read = readBridgeHostMessage(json)
  if (!read.ok || read.message.type !== 'init') {
    throw new Error(
      `not an init the page would read: ${read.ok ? read.message.type : read.refusal}`
    )
  }
  return read.message
}

describe('foldDivision on init', () => {
  it('reads an init without the field as flat, which is every shell before it', () => {
    for (const value of [undefined, null]) {
      const init = readInit(JSON.stringify(initFrame(value)))
      expect('foldDivision' in init).toBe(false)
      expect(readShellSession(init).foldDivision).toBeNull()
    }
  })

  it('passes the hinge through to the session the page holds', () => {
    expect(readShellSession(readInit(JSON.stringify(initFrame(HINGE)))).foldDivision).toEqual(HINGE)
  })

  it('refuses a negative or non-numeric hinge', () => {
    for (const bad of [{ ...HINGE, y: -1 }, { ...HINGE, width: '951' }, 'hinge']) {
      const frame = { ...initFrame(), foldDivision: bad }
      expect(readBridgeHostMessage(JSON.stringify(frame)).ok, JSON.stringify(bad)).toBe(false)
    }
  })
})

describe('a device that folds under a live page', () => {
  it('re-sends init when the hinge appears, moves and goes, and the page reads each in place', async () => {
    const pair = createFakeBridgePortPair()
    await pair.flush()
    const session = pair.client.getShellSession()
    expect(session?.foldDivision).toBeNull()
    const seen: (typeof HINGE | null)[] = []
    const unsubscribe = pair.client.onWindowRegionsUpdate(() =>
      seen.push(pair.client.getShellSession()?.foldDivision ?? null)
    )
    const moved = { ...HINGE, y: 300 }
    for (const division of [HINGE, moved, null]) {
      pair.host.publishFoldDivision(division)
      await pair.flush()
      expect(pair.client.getShellSession()?.foldDivision).toEqual(division)
    }
    expect(seen).toEqual([HINGE, moved, null])
    unsubscribe()
    expect(pair.client.getShellSession()?.sessionId).toBe(session?.sessionId)
  })

  it('sends nothing for a hinge that did not move', async () => {
    const pair = createFakeBridgePortPair()
    await pair.flush()
    pair.host.publishFoldDivision(HINGE)
    await pair.flush()
    const inits = () => pair.readToPage().filter((frame) => frame.type === 'init').length
    const before = inits()
    pair.host.publishFoldDivision({ ...HINGE })
    await pair.flush()
    expect(inits()).toBe(before)
  })
})

afterEach(closeResources)
