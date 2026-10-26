import { z } from 'zod'
import { BRIDGE_MAX_SAFE_AREA_INSET } from './bridge-safe-area-insets'

const coordinateSchema = z.number().finite().min(0).max(BRIDGE_MAX_SAFE_AREA_INSET)

/**
 * Where a partially folded device divides the window at its hinge, in the page's px from the
 * window's origin. Optional and additive: absent reads as flat, which is every older shell, and an
 * older page drops the field.
 */
export const BridgeFoldDivisionSchema = z.object({
  x: coordinateSchema,
  y: coordinateSchema,
  width: coordinateSchema,
  height: coordinateSchema
})

export type BridgeFoldDivision = z.infer<typeof BridgeFoldDivisionSchema>

export function sameFoldDivision(
  left: BridgeFoldDivision | null,
  right: BridgeFoldDivision | null
): boolean {
  if (left === null || right === null) {
    return left === right
  }
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}
