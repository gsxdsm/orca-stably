import * as z from 'zod'
import {
  ANTIGRAVITY_USAGE_SOURCES,
  type AntigravityUsageSource
} from '../../../src/shared/agent-usage/rate-limits/antigravity-usage-source'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc/rpc-operation'
import { rpcResultVariant } from '../transport/rpc/rpc-operation-result-reader'

const antigravityUsageSourceSchema = z.enum(ANTIGRAVITY_USAGE_SOURCES)

const hostSettingsAntigravitySourceSchema = z
  .object({
    settings: z
      .object({
        antigravityUsageSource: antigravityUsageSourceSchema.optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough()
  .transform(
    (value): AntigravityUsageSource | null => value.settings?.antigravityUsageSource ?? null
  )

/** Reads the host's Antigravity usage source; null means an older host that does not support the setting. */
export const antigravityUsageSourceRead = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'settings.antigravity-usage-source-or-skip',
    method: 'settings.get',
    acceptance: 'success-result-or-skip',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('antigravity-usage-source', hostSettingsAntigravitySourceSchema)
  })
)

/** Writes the host's Antigravity usage source; returns the confirmed value or throws on refusal. */
export const antigravityUsageSourceWrite = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'settings.update-antigravity-usage-source',
    method: 'settings.update',
    acceptance: 'require-result-or-throw-message',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('antigravity-usage-source-written', hostSettingsAntigravitySourceSchema)
  })
)
