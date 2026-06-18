/** Shared layout constants + helpers for the TUI shell, used by both the app
 *  (mouse hit-testing) and the presentational view (rendering) so geometry
 *  stays in one place. */

/** Below this width the two panes collapse into single-pane nav views. */
export const NARROW_THRESHOLD = 64
/** Rows occupied by the top header bar. */
export const HEADER_ROWS = 1
/** Width of the narrow-mode workspace status strip. */
export const STRIP_WIDTH = 2
/** The narrow-mode "back to workspaces" button label (its width is its hit box). */
export const BACK_LABEL = ' ‹ workspaces '

export type NarrowView = 'list' | 'terminal'

export function sidebarWidthFor(columns: number): number {
  return Math.max(16, Math.min(34, Math.floor(columns * 0.34)))
}
