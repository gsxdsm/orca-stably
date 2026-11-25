import { describe, expect, it } from 'vitest'
import { agentReferenceNote } from '../../../../src/shared/orchestration/mailbox/orchestration-agent-reference'
import { projectMobileCrewMentions } from './mobile-orchestration-crew'

describe('mobile orchestration crew', () => {
  it('projects the routing note on send', () => {
    const draft = 'Look at @Worker (Orca agent term_worker) '
    expect(projectMobileCrewMentions(draft)).toBe(
      `Look at @Worker\n\n${agentReferenceNote('Worker', 'term_worker')}`
    )
    expect(projectMobileCrewMentions('plain')).toBe('plain')
  })
})
