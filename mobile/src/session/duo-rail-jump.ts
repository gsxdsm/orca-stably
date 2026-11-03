import type { ReservedRect } from '../../modules/orca-reserved-regions/src'
import { duoRailJumpFrames, type DuoRailJumpFrames } from '../layout/duo-status-row'
import type { SideRailStrip } from '../layout/side-rail-strip'
import { duoRailBackVisible } from './duo-rail-back'

/** Rail frames when chat is collapsed beside a column with room; otherwise in-transcript. */
export function duoRailJumpPlacement(args: {
  chatVisible: boolean
  expanded: boolean
  strip: SideRailStrip | null
  keyboardInset: number
  windowWidth: number
  windowHeight: number
  occlusions: readonly ReservedRect[]
}): DuoRailJumpFrames | null {
  if (!duoRailBackVisible(args) || args.strip === null) {
    return null
  }
  return duoRailJumpFrames({
    windowWidth: args.windowWidth,
    windowHeight: args.windowHeight,
    strip: args.strip,
    occlusions: args.occlusions
  })
}
