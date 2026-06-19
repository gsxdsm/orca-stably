// Pure parser for the live `agentStatus.interactivePrompt` envelope (JSON the
// host captures from the agent's hook). It resolves to either a structured
// question prompt (AskUserQuestion) or a tool-approval (PermissionRequest), the
// two interactive cards the native chat renders just above the composer. Kept
// pure (no React/IO) so the envelope rules are unit-testable. Mirrors the mobile
// parsers (mobile-native-chat-ask.ts / mobile-native-chat-permission.ts) but
// shares no code with them.

export type AskOption = { label: string; description?: string }
export type AskQuestion = {
  question: string
  header?: string
  multiSelect: boolean
  options: AskOption[]
}
export type AskPrompt = { questions: AskQuestion[] }

/** A detected tool-approval, rendered as an Allow/Deny card. Each option's
 *  `send` is the literal string written back to the agent's PTY when chosen
 *  (a number to allow; the ESC char to deny). */
export type ChatApproval = {
  title: string
  detail?: string
  options: { label: string; send: string }[]
}

/** The interactive card to render for the current live status, or null. A
 *  question takes precedence over an approval when both somehow parse. */
export type InteractivePromptCard =
  | { kind: 'question'; prompt: AskPrompt }
  | { kind: 'approval'; approval: ChatApproval }
  | null

// ESC interrupts the agent over the PTY (matches how the composer forwards
// Escape), so "Cancel"/"Deny" sends this byte.
const ESCAPE = String.fromCharCode(27)

/** Claude's AskUserQuestion shape: `{ questions: [{ question, header,
 *  multiSelect, options: [{ label, description }] }] }`. Also the de-facto
 *  default shape, so a new agent that reuses it works without registration. */
function parseQuestionsShape(input: unknown): AskPrompt | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const rawQuestions = (input as { questions?: unknown }).questions
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return null
  }
  const questions: AskQuestion[] = []
  for (const raw of rawQuestions) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const q = raw as Record<string, unknown>
    const question = typeof q.question === 'string' ? q.question : ''
    const options = parseOptions(q.options)
    if (question || options.length > 0) {
      questions.push({
        question,
        header: typeof q.header === 'string' ? q.header : undefined,
        multiSelect: q.multiSelect === true,
        options
      })
    }
  }
  return questions.length > 0 ? { questions } : null
}

function parseOptions(raw: unknown): AskOption[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((o): AskOption | null => {
      if (typeof o === 'string') {
        return { label: o }
      }
      if (o && typeof o === 'object' && typeof (o as { label?: unknown }).label === 'string') {
        const obj = o as { label: string; description?: unknown }
        return {
          label: obj.label,
          description: typeof obj.description === 'string' ? obj.description : undefined
        }
      }
      return null
    })
    .filter((o): o is AskOption => o !== null)
}

/** Parse the `{ questions: [...] }` envelope into an AskPrompt, or null. */
export function parseAskFromStatus(interactivePrompt: string | undefined | null): AskPrompt | null {
  if (!interactivePrompt) {
    return null
  }
  try {
    return parseQuestionsShape(JSON.parse(interactivePrompt))
  } catch {
    return null
  }
}

/** Parse the `{ approval: { tool, summary } }` envelope (emitted by the host on
 *  a PermissionRequest) into an Allow/Deny card, or null. Allow sends "1"; Deny
 *  sends ESC — matching the common TUI approval prompt. */
export function parseApprovalFromStatus(
  interactivePrompt: string | undefined | null
): ChatApproval | null {
  if (!interactivePrompt) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(interactivePrompt)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') {
    return null
  }
  const approval = (parsed as { approval?: unknown }).approval
  if (!approval || typeof approval !== 'object') {
    return null
  }
  const tool = (approval as { tool?: unknown }).tool
  if (typeof tool !== 'string' || tool.length === 0) {
    return null
  }
  const summary = (approval as { summary?: unknown }).summary
  return {
    title: `Allow ${tool}?`,
    detail: typeof summary === 'string' && summary.length > 0 ? summary : undefined,
    options: [
      { label: 'Allow', send: '1' },
      { label: 'Deny', send: ESCAPE }
    ]
  }
}

/** Resolve the live `interactivePrompt` to the single card to render. A question
 *  takes precedence over an approval. */
export function parseInteractivePrompt(
  interactivePrompt: string | undefined | null
): InteractivePromptCard {
  const prompt = parseAskFromStatus(interactivePrompt)
  if (prompt) {
    return { kind: 'question', prompt }
  }
  const approval = parseApprovalFromStatus(interactivePrompt)
  if (approval) {
    return { kind: 'approval', approval }
  }
  return null
}

/** Build the answer text to send: exactly one line per question, in question
 *  order, each line the selected option label(s) joined by ", ". Empty answers
 *  stay as empty lines (not dropped) so N lines always == N questions — the
 *  per-question Enter stepping counts one Enter per line, so dropping a blank
 *  middle answer would misalign the count and leave the prompt unsubmitted. */
export function formatAskAnswer(prompt: AskPrompt, selections: string[][]): string {
  return prompt.questions.map((_, i) => (selections[i] ?? []).join(', ')).join('\n')
}
