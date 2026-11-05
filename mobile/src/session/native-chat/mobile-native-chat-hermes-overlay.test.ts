import { HERMES_TRANSCRIPT_RUNTIME_CAPABILITY } from '../../../../src/shared/native-chat/native-chat-hermes-capability'
import { describe, expect, it } from 'vitest'
import { resolveMobileNativeChat } from './mobile-native-chat-eligibility'
import { mobileNativeChatEmptyState } from './mobile-native-chat-render-data'
import { getMobileNativeChatToggleActions } from './mobile-native-chat-toggle-action'

describe('Hermes terminal overlay', () => {
  it('opens only when the host advertises the reader', () => {
    const tab = { type: 'terminal' as const, launchAgent: 'hermes' }
    expect(resolveMobileNativeChat(tab, true)).toBeNull()
    expect(resolveMobileNativeChat(tab, true, true)).toMatchObject({ agent: 'hermes' })
    expect(resolveMobileNativeChat(tab, false, true)).toBeNull()
  })

  it.each(['waiting-session', 'awaiting-transcript'] as const)(
    'shows Hermes connecting while %s',
    (status) => {
      expect(mobileNativeChatEmptyState(status, 'hermes')?.title).toBe('Connecting to Hermes…')
    }
  )

  it.each([false, true])('gates the chat switch on host support: %s', (supported) => {
    const actions = getMobileNativeChatToggleActions({
      terminalHandle: 'terminal-1',
      tabs: [{ type: 'terminal', id: 'hermes', terminal: 'terminal-1', launchAgent: 'hermes' }],
      isTabChatView: () => false,
      hostCapabilities: supported ? [HERMES_TRANSCRIPT_RUNTIME_CAPABILITY] : [],
      nativeChatTranscriptIsLocalReadable: true,
      onClose: () => undefined,
      onToggle: () => undefined
    })
    expect(actions.some((action) => action.id === 'toggleChatView')).toBe(supported)
  })
})
