import type { AgentSessionAttachParams } from '../../native-chat/agent-session-wire/acquisition/structured-agent-session-attach'

/** A committed replay keeps only its identity fields; Hermes re-attaches by its ACP load id. */
export function withHermesLoadSessionId(
  replay: AgentSessionAttachParams,
  hermesLoadId: string | null | undefined
): AgentSessionAttachParams {
  if (!hermesLoadId) {
    return replay
  }
  return {
    envelope: replay.envelope,
    location: replay.location,
    provider: replay.provider,
    agent: replay.agent,
    accountHome: replay.accountHome,
    ...(replay.options ? { options: replay.options } : {}),
    acpLoadSessionId: hermesLoadId,
    runtimeKind: replay.runtimeKind
  }
}
