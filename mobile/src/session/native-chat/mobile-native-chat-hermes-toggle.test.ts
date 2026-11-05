import { HERMES_TRANSCRIPT_RUNTIME_CAPABILITY } from '../../../../src/shared/native-chat/native-chat-hermes-capability'
import { describe, expect, it, vi } from 'vitest'
import { getMobileNativeChatToggleActions } from './mobile-native-chat-toggle-action'

describe('getMobileNativeChatToggleActions', () => {
  it.each([false, true])('gates the Hermes chat switch on host support: %s', (supported) => {
    const actions = getMobileNativeChatToggleActions({
      terminalHandle: 'terminal-1',
      tabs: [{ type: 'terminal', id: 'hermes', terminal: 'terminal-1', launchAgent: 'hermes' }],
      isTabChatView: () => false,
      hostCapabilities: supported ? [HERMES_TRANSCRIPT_RUNTIME_CAPABILITY] : [],
      nativeChatTranscriptIsLocalReadable: true,
      onClose: vi.fn(),
      onToggle: vi.fn()
    })
    expect(actions.some((action) => action.id === 'toggleChatView')).toBe(supported)
  })
})
