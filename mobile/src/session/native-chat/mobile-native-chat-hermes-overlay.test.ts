import { describe, expect, it } from 'vitest'
import { HERMES_TRANSCRIPT_RUNTIME_CAPABILITY } from '../../../../src/shared/native-chat/native-chat-hermes-capability'
import { resolveMobileNativeChat } from './mobile-native-chat-eligibility'
import { getMobileNativeChatToggleActions } from './mobile-native-chat-toggle-action'
import { mobileNativeChatEmptyState } from './transcript/mobile-native-chat-render-data'

describe('Hermes terminal overlay gate', () => {
  const tab = { type: 'terminal' as const, launchAgent: 'hermes' }

  it('only opens a Hermes terminal overlay when the host advertises the reader', () => {
    expect(resolveMobileNativeChat(tab, true)).toBeNull()
    expect(resolveMobileNativeChat(tab, true, true)).toMatchObject({ agent: 'hermes' })
    expect(resolveMobileNativeChat(tab, false, true)).toBeNull()
  })

  it.each([false, true])('gates the Hermes chat switch on host support: %s', (supported) => {
    const actions = getMobileNativeChatToggleActions({
      terminalHandle: 'terminal-1',
      tabs: [{ ...tab, id: 'hermes', terminal: 'terminal-1' }],
      isTabChatView: () => false,
      hostCapabilities: supported ? [HERMES_TRANSCRIPT_RUNTIME_CAPABILITY] : [],
      nativeChatTranscriptIsLocalReadable: true,
      onClose: () => undefined,
      onToggle: () => undefined
    })
    expect(actions.some((action) => action.id === 'toggleChatView')).toBe(supported)
  })

  it.each(['waiting-session', 'awaiting-transcript'] as const)(
    'shows Hermes connecting while %s',
    (status) => {
      expect(mobileNativeChatEmptyState(status, 'hermes')?.title).toBe('Connecting to Hermes…')
    }
  )
})
