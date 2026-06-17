// Pure: turn raw composer text into the exact PTY bytes to write. Kept separate
// from the React composer so the byte rules are unit-testable without a DOM.

// Why: bracketed-paste markers let modern agent TUIs (Claude / Codex / etc.)
// treat injected multi-line text as one atomic paste instead of running each
// embedded newline as a line-edit / submit. Mirrors agent-paste-draft.ts and
// terminal-bracketed-paste.ts so native input is byte-identical to a real paste.
const BRACKETED_PASTE_BEGIN = '\x1b[200~'
const BRACKETED_PASTE_END = '\x1b[201~'

// Why: carriage return (not \n) is what xterm/agent composers treat as the
// submit/Enter key over a PTY.
const SUBMIT = '\r'

/** True when the draft spans more than one line (so it needs bracketed-paste
 *  wrapping). A trailing newline alone still counts as multi-line. */
export function isMultilineDraft(text: string): boolean {
  return /[\r\n]/.test(text)
}

/**
 * Compute the bytes to write for `text` + Enter:
 *  - single-line → `text\r`
 *  - multi-line  → `\x1b[200~…\x1b[201~\r` (bracketed-paste wrapped, then submit)
 *
 * The trailing `\r` is always appended because the native composer's Enter is a
 * send. Callers wanting an un-submitted draft should not use this helper.
 */
export function buildNativeChatSendBytes(text: string): string {
  if (isMultilineDraft(text)) {
    return `${BRACKETED_PASTE_BEGIN}${text}${BRACKETED_PASTE_END}${SUBMIT}`
  }
  return `${text}${SUBMIT}`
}
