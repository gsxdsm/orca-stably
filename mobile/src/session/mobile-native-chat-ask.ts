import type { NativeChatBlock, NativeChatMessage } from '../../../src/shared/native-chat-types'

// Why: Claude's AskUserQuestion tool records its full structured prompt (question
// text + options) in the transcript as a tool-call block. Since the mobile chat
// already streams the transcript, we render that structure natively instead of
// heuristically parsing status text. A prompt is "pending" while its tool-call is
// the most recent tool activity with no following tool-result.

const ASK_TOOL_NAMES = new Set(['AskUserQuestion', 'ask_user_question', 'askUserQuestion'])

export type AskOption = { label: string; description?: string }
export type AskQuestion = {
  question: string
  header?: string
  multiSelect: boolean
  options: AskOption[]
}
export type AskPrompt = { questions: AskQuestion[] }

function asAskPrompt(input: unknown): AskPrompt | null {
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
    const options = Array.isArray(q.options)
      ? q.options
          .map((o): AskOption | null => {
            if (typeof o === 'string') {
              return { label: o }
            }
            if (
              o &&
              typeof o === 'object' &&
              typeof (o as { label?: unknown }).label === 'string'
            ) {
              const obj = o as { label: string; description?: unknown }
              return {
                label: obj.label,
                description: typeof obj.description === 'string' ? obj.description : undefined
              }
            }
            return null
          })
          .filter((o): o is AskOption => o !== null)
      : []
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

function isAskCall(block: NativeChatBlock): boolean {
  return block.type === 'tool-call' && ASK_TOOL_NAMES.has(block.name)
}

/** The most recent AskUserQuestion prompt still awaiting an answer, or null. A
 *  prompt is answered once any tool-result follows it in the message stream. */
export function extractPendingAsk(messages: readonly NativeChatMessage[]): AskPrompt | null {
  let pending: AskPrompt | null = null
  for (const message of messages) {
    for (const block of message.blocks) {
      if (isAskCall(block) && block.type === 'tool-call') {
        const parsed = asAskPrompt(block.input)
        if (parsed) {
          pending = parsed
        }
      } else if (block.type === 'tool-result') {
        // A result means the preceding ask (if any) has been answered.
        pending = null
      }
    }
  }
  return pending
}

/** Build the answer text to send to the agent: one line per question, each the
 *  selected option label(s). Mirrors how a user would type the choice. */
export function formatAskAnswer(prompt: AskPrompt, selections: string[][]): string {
  return prompt.questions
    .map((_, i) => (selections[i] ?? []).join(', '))
    .filter((line) => line.length > 0)
    .join('\n')
}
