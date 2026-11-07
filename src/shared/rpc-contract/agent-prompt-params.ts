import * as z from 'zod'
import { Identifier } from './structured-agent-session-identifiers'

export const AGENT_PROMPT_OPTION_ROLES = ['approve', 'approve-always', 'deny', 'other'] as const

export const AgentPromptOptionRole = z.enum(AGENT_PROMPT_OPTION_ROLES)

export const PendingAgentPromptOption = z
  .object({
    optionId: z.string().min(1),
    label: z.string().min(1),
    role: AgentPromptOptionRole
  })
  .strict()

export const PendingAgentPromptTarget = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chat'), sessionId: z.string().min(1) }).strict(),
  z.object({ type: z.literal('terminal'), terminal: z.string().min(1) }).strict()
])

/** One live approval or question the watch can answer. `detail` is a tool plus a short input. */
export const PendingAgentPrompt = z
  .object({
    promptId: z.string().min(1),
    kind: z.enum(['permission', 'question']),
    target: PendingAgentPromptTarget,
    worktreeId: z.string().min(1),
    agent: z.string().min(1),
    title: z.string().min(1),
    detail: z.string().min(1).max(300).optional(),
    options: z.array(PendingAgentPromptOption).min(1),
    createdAt: z.number().finite()
  })
  .strict()

export type AgentPromptOptionRole = z.infer<typeof AgentPromptOptionRole>
export type PendingAgentPrompt = z.infer<typeof PendingAgentPrompt>

export const AgentPromptListPendingParams = z.object({}).strict()

export const AgentPromptListPendingResult = z
  .object({
    prompts: z.array(PendingAgentPrompt)
  })
  .strict()

export const AgentPromptRespondParams = z
  .object({
    promptId: Identifier('Invalid prompt id', 2048),
    optionId: Identifier('Invalid option id'),
    clientOperationId: Identifier('Invalid client operation id')
  })
  .strict()

export const AgentPromptRespondResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      reason: z.enum(['stale', 'not_found', 'rejected', 'unavailable'])
    })
    .strict()
])

export type AgentPromptRespondResult = z.infer<typeof AgentPromptRespondResultSchema>
