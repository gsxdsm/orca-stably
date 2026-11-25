import {
  agentReferenceNote,
  isPublicOrchestrationAddress,
  mayHoldAgentReferences,
  printableAgentLabel
} from '../../../../src/shared/orchestration/mailbox/orchestration-agent-reference'

const TOKEN = /@([^\n@]*?) \(Orca agent ([^)\n]+)\)/g

/** Desktop adds the routing note when the composer serializes a mention. The phone's plain draft does the same on send. */
export function projectMobileCrewMentions(text: string): string {
  if (!mayHoldAgentReferences(text)) {
    return text
  }
  const notes: string[] = []
  const seen = new Set<string>()
  const body = text.replace(TOKEN, (match, label: string, address: string) => {
    if (!isPublicOrchestrationAddress(address)) {
      return match
    }
    const clean = printableAgentLabel(label).trim() || 'Agent'
    if (!seen.has(address)) {
      seen.add(address)
      notes.push(agentReferenceNote(clean, address))
    }
    return `@${clean}`
  })
  if (notes.length === 0) {
    return text
  }
  return `${body.trimEnd()}\n\n${notes.join('\n')}`
}
