/** A run of terminal cells sharing one style. */
export type StyledSpan = {
  text: string
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
}

export type StyledLine = StyledSpan[]

export type TerminalScreenState = {
  /** Styled lines of the focused terminal's visible screen (top to bottom). */
  lines: StyledLine[]
  /** True once a snapshot has been fetched; false while connecting. */
  connected: boolean
  /** True when colors are unavailable (runtime lacks terminal.readAnsi) and we
   *  fell back to the plain-text tail. */
  plainFallback: boolean
}

export function emptyScreenState(): TerminalScreenState {
  return { lines: [], connected: false, plainFallback: false }
}

/** Wrap plain text lines as single-span styled lines (no color) — the fallback
 *  when the runtime can't serialize ANSI. */
export function plainLinesToStyled(lines: readonly string[]): StyledLine[] {
  return lines.map((text) => (text.length > 0 ? [{ text }] : []))
}
