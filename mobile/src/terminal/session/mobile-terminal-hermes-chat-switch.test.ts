import { HERMES_TRANSCRIPT_RUNTIME_CAPABILITY } from '../../../../src/shared/native-chat/native-chat-hermes-capability'
import { describe, expect, it, vi } from 'vitest'
import { getMobileTerminalActionSheetActions } from './mobile-terminal-action-sheet-actions'

vi.mock('lucide-react-native', () => ({
  Eraser: vi.fn(),
  MessageSquare: vi.fn(),
  Monitor: vi.fn(),
  Smartphone: vi.fn(),
  SquareTerminal: vi.fn()
}))

type SheetArgs = Parameters<typeof getMobileTerminalActionSheetActions>[0]

function buildActions(overrides: Partial<SheetArgs> = {}) {
  return getMobileTerminalActionSheetActions({
    target: { handle: 'terminal-1' },
    tabs: [],
    isTabChatView: () => false,
    nativeChatTranscriptIsLocalReadable: true,
    onDismiss: vi.fn(),
    onToggleChat: vi.fn(),
    isPhoneMode: () => false,
    onToggleDisplayMode: vi.fn(),
    onRename: vi.fn(),
    onClear: vi.fn(),
    onClose: vi.fn(),
    onCloseSessionTab: vi.fn(),
    ...overrides
  })
}

describe('getMobileTerminalActionSheetActions', () => {
  it.each([false, true])('gates the Hermes chat switch on host support: %s', (supported) => {
    const actions = buildActions({
      tabs: [
        {
          type: 'terminal',
          id: 'hermes',
          terminal: 'terminal-1',
          launchAgent: 'hermes'
        }
      ],
      hostCapabilities: supported ? [HERMES_TRANSCRIPT_RUNTIME_CAPABILITY] : []
    })
    expect(actions.some((action) => action.id === 'toggleChatView')).toBe(supported)
  })
})
