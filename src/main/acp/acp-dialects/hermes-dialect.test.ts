import { describe, expect, it } from 'vitest'
import { HERMES_ACP_DIALECT } from './hermes-dialect'

describe('HERMES_ACP_DIALECT', () => {
  it('treats an empty load body as a missing Hermes session', () => {
    expect(HERMES_ACP_DIALECT.loadedSessionMissing?.({})).toBe(true)
    expect(
      HERMES_ACP_DIALECT.loadedSessionMissing?.({
        modes: { currentModeId: 'default', availableModes: [] }
      })
    ).toBe(false)
  })
})
