import * as z from 'zod'

const watchId = z.string().min(1)
const watchConnection = z.enum(['connected', 'connecting', 'offline'])
const watchSessionStatus = z.enum(['needs-input', 'working', 'done', 'idle'])
const watchPromptRole = z.enum(['approve', 'approve-always', 'deny', 'other'])
const watchPromptKind = z.enum(['permission', 'question'])
const watchFeedKind = z.enum(['needs-input', 'finished', 'bell', 'other'])
const watchFailureReason = z.enum([
  'stale',
  'not_found',
  'rejected',
  'unavailable',
  'phone_unavailable',
  'invalid'
])

export const watchHostSchema = z.strictObject({
  hostId: watchId,
  name: z.string().min(1),
  connection: watchConnection
})

export const watchSessionSchema = z.strictObject({
  key: watchId,
  hostId: watchId,
  title: z.string().min(1),
  agent: z.string().min(1),
  workspace: z.string().min(1),
  status: watchSessionStatus,
  latest: z.string().max(280).optional(),
  toolName: z.string().min(1).optional(),
  updatedAt: z.number(),
  canSend: z.boolean(),
  pendingPromptId: watchId.optional()
})

export const watchPromptOptionSchema = z.strictObject({
  optionId: watchId,
  label: z.string(),
  role: watchPromptRole
})

export const watchPromptSchema = z.strictObject({
  hostId: watchId,
  promptId: watchId,
  sessionKey: watchId,
  kind: watchPromptKind,
  title: z.string().min(1),
  detail: z.string().max(300).optional(),
  options: z.array(watchPromptOptionSchema),
  createdAt: z.number()
})

export const watchFeedItemSchema = z.strictObject({
  id: watchId,
  hostId: watchId,
  sessionKey: watchId.optional(),
  title: z.string(),
  body: z.string(),
  at: z.number(),
  kind: watchFeedKind
})

const watchTimestamp = z.int().nonnegative()

export const watchBotSchema = z.strictObject({
  hostId: watchId,
  botId: watchId,
  name: watchId,
  status: watchId,
  updatedAt: watchTimestamp
})

export const watchNeedSchema = z.strictObject({
  hostId: watchId,
  key: watchId,
  title: watchId,
  botId: watchId.optional(),
  sessionKey: watchId.optional(),
  promptId: watchId.optional(),
  updatedAt: watchTimestamp
})

export const watchUsageSchema = z.strictObject({
  hostId: watchId,
  provider: watchId,
  window: watchId,
  usedPercent: z.number().min(0).max(100),
  updatedAt: watchTimestamp,
  resetsAt: watchTimestamp.optional()
})

export const watchSnapshotSchema = z.strictObject({
  v: z.literal(1),
  generatedAt: z.number(),
  hosts: z.array(watchHostSchema),
  sessions: z.array(watchSessionSchema),
  prompts: z.array(watchPromptSchema),
  feed: z.array(watchFeedItemSchema),
  bots: z.array(watchBotSchema).optional(),
  needsYou: z.array(watchNeedSchema).optional(),
  usage: z.array(watchUsageSchema).optional()
})

const watchCommandBase = { v: z.literal(1), id: watchId }

export const watchCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...watchCommandBase, type: z.literal('refresh') }),
  z.strictObject({
    ...watchCommandBase,
    type: z.literal('respond'),
    hostId: watchId,
    promptId: watchId,
    optionId: watchId
  }),
  z.strictObject({
    ...watchCommandBase,
    type: z.literal('send'),
    sessionKey: watchId,
    text: z.string().min(1).max(2000)
  }),
  z.strictObject({
    ...watchCommandBase,
    type: z.literal('openOnPhone'),
    sessionKey: watchId
  })
])

export const watchReplySchema = z.discriminatedUnion('ok', [
  z.strictObject({
    v: z.literal(1),
    id: watchId,
    ok: z.literal(true),
    snapshot: watchSnapshotSchema.optional()
  }),
  z.strictObject({
    v: z.literal(1),
    id: watchId,
    ok: z.literal(false),
    reason: watchFailureReason,
    detail: z.string().min(1).max(160).optional()
  })
])

export type WatchHost = z.infer<typeof watchHostSchema>
export type WatchSession = z.infer<typeof watchSessionSchema>
export type WatchPrompt = z.infer<typeof watchPromptSchema>
export type WatchFeedItem = z.infer<typeof watchFeedItemSchema>
export type WatchBot = z.infer<typeof watchBotSchema>
export type WatchNeed = z.infer<typeof watchNeedSchema>
export type WatchUsage = z.infer<typeof watchUsageSchema>
export type WatchSnapshot = z.infer<typeof watchSnapshotSchema>
export type WatchCommand = z.infer<typeof watchCommandSchema>
export type WatchReply = z.infer<typeof watchReplySchema>
export type WatchFailureReason = z.infer<typeof watchFailureReason>
