import { describe, expect, it } from 'vitest'
import { formatOrcaSessionAddress as address } from '../../../../shared/agent-session/identity/orca-session-address'
import { CrewReadModel } from './crew-read-model'
import {
  crewRecord,
  deltaFixture,
  remembered,
  SELF,
  TARGET
} from './crew-recipient-delta-cost.test-fixture'

describe('crew send to a live chat with several former Runs', () => {
  it('offers the chat itself, where send delivers', () => {
    const f = deltaFixture()
    f.records.set(TARGET, crewRecord(TARGET))
    f.visible.add(TARGET)
    f.db.insertMessage({ from: address(TARGET), to: address(SELF), subject: 'Hi', body: 'hi' })
    remembered(f)
    const crew = new CrewReadModel(
      () => f.deps,
      () => () => {}
    ).read(address(SELF))

    expect(crew.sections.talkingWith.map((row) => row.sendAddress)).toEqual([address(TARGET)])
  })
})
