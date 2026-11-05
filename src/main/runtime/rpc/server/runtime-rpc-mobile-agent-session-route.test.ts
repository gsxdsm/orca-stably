import { describe, expect, it } from 'vitest'
import { MOBILE_RPC_METHOD_ROUTES } from './runtime-rpc-mobile-method-routing'

describe('agentSession.agents mobile route', () => {
  it('routes registered agent discovery to the workspace host for mobile chat launches', () => {
    expect(MOBILE_RPC_METHOD_ROUTES.get('agentSession.agents')).toBe('execution-host')
  })
})
