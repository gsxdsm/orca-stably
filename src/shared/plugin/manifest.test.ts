import { describe, expect, it } from 'vitest'
import { isPluginCapability, PLUGIN_CAPABILITIES, SUPPORTED_HOST_API_MAJOR } from './manifest'

describe('plugin capability union', () => {
  it('recognizes every declared capability', () => {
    for (const cap of PLUGIN_CAPABILITIES) {
      expect(isPluginCapability(cap)).toBe(true)
    }
  })

  it('rejects unknown / non-string values', () => {
    expect(isPluginCapability('process:exec')).toBe(false)
    expect(isPluginCapability('')).toBe(false)
    expect(isPluginCapability(undefined)).toBe(false)
    expect(isPluginCapability(42)).toBe(false)
  })

  it('is pre-stable (host API major 0)', () => {
    expect(SUPPORTED_HOST_API_MAJOR).toBe(0)
  })
})
