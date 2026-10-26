import { describe, expect, it } from 'vitest'
import { sideRailTopFromOcclusions } from './window-regions'

describe('sideRailTopFromOcclusions', () => {
  it('starts the rail below the status column and island at the right edge', () => {
    const statusColumn = { x: 867, y: 0, width: 84, height: 208 }
    const island = { x: 880, y: 12, width: 58, height: 120 }
    expect(sideRailTopFromOcclusions([statusColumn, island], 951)).toBe(208)
  })

  it('ignores occlusions away from the right edge', () => {
    expect(sideRailTopFromOcclusions([{ x: 0, y: 0, width: 84, height: 300 }], 951)).toBeNull()
    expect(sideRailTopFromOcclusions([], 951)).toBeNull()
  })
})
