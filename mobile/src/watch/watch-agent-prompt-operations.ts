import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc/rpc-operation'
import { rpcResultVariant } from '../transport/rpc/rpc-operation-result-reader'
import {
  AgentPromptListPendingResult,
  AgentPromptRespondResultSchema
} from '../../../src/shared/rpc-contract/agent-prompt-params'

export const agentPromptListPending = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'agent-prompt.list-pending',
    method: 'agentPrompt.listPending',
    acceptance: 'object-result-or-null',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('agent-prompt-list', AgentPromptListPendingResult)
  })
)

export const agentPromptRespond = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'agent-prompt.respond',
    method: 'agentPrompt.respond',
    acceptance: 'object-result-or-null',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('agent-prompt-respond', AgentPromptRespondResultSchema)
  })
)
