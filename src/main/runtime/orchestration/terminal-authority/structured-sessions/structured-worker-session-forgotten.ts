import { getStructuredAgentSessionHost } from '../../../../native-chat/agent-session-wire/host/structured-agent-session-registry'
import { readOlderOrcaChatsPending } from '../../../../native-chat/agent-session-journal/journal-legacy-chats-pending'
import { sessionIdFromStructuredWorkerIncarnation } from './structured-worker-incarnation'

/** The store forgets a session only at rest and after its /clear successor, so a root gone from a
 *  loaded, writable store proves its lineage ended. A read-only or absent store proves nothing,
 *  nor does one an older Orca's journal may still add the chat to on a later launch. */
export async function structuredWorkerSessionForgotten(
  processIncarnation: string | null
): Promise<boolean> {
  const sessionId = sessionIdFromStructuredWorkerIncarnation(processIncarnation)
  try {
    const host = getStructuredAgentSessionHost()
    const store = host?.deps.store
    return (
      !!sessionId &&
      !!host &&
      !!store &&
      !store.readOnly &&
      store.getRecord(sessionId) === null &&
      !store.isSessionUnreadable(sessionId) &&
      !host.hasSession(sessionId) &&
      !(await readOlderOrcaChatsPending(host.deps.journalDatabase))
    )
  } catch {
    return false
  }
}
