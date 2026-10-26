/** Where a partially folded device divides the window at its hinge, in window points. */
export type FoldDivision = { x: number; y: number; width: number; height: number }

/**
 * How the hinge splits the window. `stacked`: across it, laptop-style, with a top and a bottom
 * half. `sideBySide`: down it, book-style, with a left and a right half. `flat` when open or closed.
 */
export type FoldPosture =
  | { kind: 'flat' }
  | { kind: 'stacked'; topEnd: number; bottomStart: number }
  | { kind: 'sideBySide'; leftEnd: number; rightStart: number }

export const FLAT_FOLD_POSTURE: FoldPosture = Object.freeze({ kind: 'flat' })

export function foldPosture(division: FoldDivision | null): FoldPosture {
  if (division === null) {
    return FLAT_FOLD_POSTURE
  }
  return division.width >= division.height
    ? { kind: 'stacked', topEnd: division.y, bottomStart: division.y + division.height }
    : { kind: 'sideBySide', leftEnd: division.x, rightStart: division.x + division.width }
}
