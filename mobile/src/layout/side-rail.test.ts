import { describe, expect, it } from 'vitest'
import { resolveSideRailWidth } from './side-rail'

describe('resolveSideRailWidth', () => {
  it('gives the iPhone Duo its right-hand status column as a rail', () => {
    expect(resolveSideRailWidth({ left: 0, right: 84 })).toBe(84)
  })

  it('leaves symmetric landscape insets alone', () => {
    expect(resolveSideRailWidth({ left: 62, right: 62 })).toBe(0)
    expect(resolveSideRailWidth({ left: 0, right: 0 })).toBe(0)
  })

  it('needs room for a button beyond the left inset', () => {
    expect(resolveSideRailWidth({ left: 0, right: 30 })).toBe(0)
  })
})
