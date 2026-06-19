import { describe, expect, it } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defaultRelayWorkspaceSnapshot, relayPluginsDir } from './relay-plugin-config'

describe('relay plugin config', () => {
  it('resolves the plugins dir under the $HOME/.orca-relay userData equivalent', () => {
    expect(relayPluginsDir()).toBe(join(homedir(), '.orca-relay', 'plugins'))
  })

  it('returns a bounded empty default workspace snapshot', () => {
    // No live workspace root on the relay (registerRoot is a no-op), so the
    // only workspace:read surface defaults to an empty, safe snapshot.
    expect(defaultRelayWorkspaceSnapshot()).toEqual({
      workspaceName: '',
      currentBranch: null,
      isDirty: false,
      openFileCount: 0
    })
  })
})
