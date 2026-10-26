import type { FoldDivision } from './fold-division'

/** No platform but iOS reports a hinge division yet. */
export function useFoldDivision(): FoldDivision | null {
  return null
}

/** No platform but iOS reports an occluded status column yet. */
export function useSideRailTop(): number | null {
  return null
}
