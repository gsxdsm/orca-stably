// Why: tool-call inputs are arbitrary JSON; the chat row only shows a one-line
// preview so a long file body or diff doesn't dominate the conversation. Kept
// pure so the truncation/serialization rules are unit-testable.

const MAX_PREVIEW_LENGTH = 80

/** One-line, length-capped preview of a tool-call input payload. Strings pass
 *  through; objects/arrays serialize to compact JSON; everything collapses
 *  whitespace and truncates with an ellipsis. Returns '' when there's nothing
 *  worth showing. */
export function summarizeToolInput(input: unknown): string {
  const raw = toRawPreview(input)
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= MAX_PREVIEW_LENGTH) {
    return collapsed
  }
  return `${collapsed.slice(0, MAX_PREVIEW_LENGTH - 1)}…`
}

/** A very short hint for a tool call in a one-line run summary: the target file's
 *  basename when present, else a clipped preview of the input. */
export function briefToolArg(input: unknown): string {
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    const path = obj.file_path ?? obj.path ?? obj.notebook_path
    if (typeof path === 'string' && path.length > 0) {
      return path.split('/').pop() ?? path
    }
    const cmd = obj.command ?? obj.cmd ?? obj.query ?? obj.pattern
    if (typeof cmd === 'string') {
      return summarizeToolInput(cmd).slice(0, 28)
    }
  }
  return summarizeToolInput(input).slice(0, 28)
}

/** One-line summary of a run of tool calls: "Bash git status · Edit app.tsx · …".
 *  `blocks` are the run's blocks; only tool calls contribute names. */
export function summarizeToolRun(
  blocks: ReadonlyArray<{ type: string; name?: string; input?: unknown }>
): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type !== 'tool-call') {
      continue
    }
    const brief = briefToolArg(block.input)
    parts.push(brief ? `${block.name ?? 'tool'} ${brief}` : (block.name ?? 'tool'))
  }
  return parts.join('  ·  ')
}

function toRawPreview(input: unknown): string {
  if (input === null || input === undefined) {
    return ''
  }
  if (typeof input === 'string') {
    return input
  }
  if (typeof input === 'number' || typeof input === 'boolean') {
    return String(input)
  }
  try {
    return JSON.stringify(input) ?? ''
  } catch {
    return ''
  }
}
