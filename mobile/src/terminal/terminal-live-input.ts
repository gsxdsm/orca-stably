const TERMINAL_LIVE_INPUT_MAX_BYTES = 256 * 1024

const encoder = new TextEncoder()

export type TerminalLiveInputFocusTimerRef = {
  current: ReturnType<typeof setTimeout> | null
}

export function getTerminalLiveSpecialKeyBytes(key: string): string | null {
  if (key === 'Backspace') {
    return '\x7f'
  }
  return null
}

// Why: iOS autocorrect/QuickType rewrites the in-progress word, so live input
// keeps the current word in the field and sends only the delta (backspaces +
// new text) to the PTY. The buffer resets at whitespace, where the word commits.
export function diffTerminalLiveWordBuffer(
  previous: string,
  next: string
): { bytes: string; buffer: string } {
  const prev = Array.from(previous)
  const cur = Array.from(next)
  let prefix = 0
  while (prefix < prev.length && prefix < cur.length && prev[prefix] === cur[prefix]) {
    prefix++
  }
  const bytes = '\x7f'.repeat(prev.length - prefix) + cur.slice(prefix).join('')
  const lastBreak = Math.max(next.lastIndexOf(' '), next.lastIndexOf('\n'), next.lastIndexOf('\t'))
  return { bytes, buffer: lastBreak === -1 ? next : next.slice(lastBreak + 1) }
}

export function isTerminalLiveInputWithinByteLimit(
  text: string,
  maxBytes = TERMINAL_LIVE_INPUT_MAX_BYTES
): boolean {
  return encoder.encode(text).byteLength <= maxBytes
}

export function clearTerminalLiveInputFocusTimer(timerRef: TerminalLiveInputFocusTimerRef): void {
  if (timerRef.current === null) {
    return
  }
  clearTimeout(timerRef.current)
  timerRef.current = null
}

export function scheduleTerminalLiveInputFocus(
  timerRef: TerminalLiveInputFocusTimerRef,
  focus: () => void,
  delayMs = 50
): void {
  // Why: live input can be toggled during route changes; replacing the pending
  // focus timer prevents stale native TextInput focus after unmount/disable.
  clearTerminalLiveInputFocusTimer(timerRef)
  timerRef.current = setTimeout(() => {
    timerRef.current = null
    focus()
  }, delayMs)
}

export { TERMINAL_LIVE_INPUT_MAX_BYTES }
