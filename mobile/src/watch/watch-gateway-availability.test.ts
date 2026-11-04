import { describe, expect, it } from 'vitest'
import { watchGatewayEnabled } from './watch-gateway-availability'

describe('watch gateway availability', () => {
  it('opens host RPC only on iOS when the native module is in the binary', () => {
    const linked = { start() {} }
    expect(watchGatewayEnabled('ios', linked)).toBe(true)
    expect(watchGatewayEnabled('ios', null)).toBe(false)
    expect(watchGatewayEnabled('android', linked)).toBe(false)
    expect(watchGatewayEnabled('web', null)).toBe(false)
    expect(watchGatewayEnabled('web', linked)).toBe(false)
  })
})
