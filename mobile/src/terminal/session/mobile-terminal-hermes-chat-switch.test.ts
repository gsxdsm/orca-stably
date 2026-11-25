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
  it('starts a new Hermes chat when the hook id is a TUI timestamp', () => {
    const onHermesTerminalChat = vi.fn()
    const actions = buildActions({
      tabs: [
        {
          type: 'terminal',
          id: 'tab-h',
          terminal: 'terminal-1',
          launchAgent: 'hermes',
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial agentStatus fixture; the action builder reads only providerSession
          agentStatus: {
            providerSession: { key: 'session_id', id: '20261031_144415_71256d' }
          } as never
        }
      ],
      structuredAgents: ['hermes'],
      hermesResumeSupported: true,
      onHermesTerminalChat
    })
    const action = actions.find((candidate) => candidate.id === 'startHermesChat')
    expect(action?.label).toBe('Start new chat')
    expect(
      actions.find((candidate) => candidate.id === 'switchHermesTerminalToChat')
    ).toBeUndefined()
    action?.onPress()
    expect(onHermesTerminalChat).toHaveBeenCalledWith({
      tabId: 'tab-h',
      providerSessionId: null
    })
  })

  it('switches a Hermes terminal when the hook id is an ACP session uuid', () => {
    const onHermesTerminalChat = vi.fn()
    const actions = buildActions({
      tabs: [
        {
          type: 'terminal',
          id: 'tab-h',
          terminal: 'terminal-1',
          launchAgent: 'hermes',
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial agentStatus fixture; the action builder reads only providerSession
          agentStatus: {
            providerSession: {
              key: 'session_id',
              id: '11111111-1111-4111-8111-111111111111'
            }
          } as never
        }
      ],
      structuredAgents: ['hermes'],
      hermesResumeSupported: true,
      onHermesTerminalChat
    })
    const action = actions.find((candidate) => candidate.id === 'switchHermesTerminalToChat')
    expect(action?.label).toBe('Switch to Chat')
    action?.onPress()
    expect(onHermesTerminalChat).toHaveBeenCalledWith({
      tabId: 'tab-h',
      providerSessionId: '11111111-1111-4111-8111-111111111111'
    })
  })

  it('starts a new Hermes chat when the terminal has no loadable session id', () => {
    const actions = buildActions({
      tabs: [{ type: 'terminal', id: 'tab-h', terminal: 'terminal-1', launchAgent: 'hermes' }],
      structuredAgents: ['hermes'],
      hermesResumeSupported: true
    })
    expect(actions.find((action) => action.id === 'startHermesChat')).toMatchObject({
      label: 'Start new chat'
    })
    expect(actions.find((action) => action.id === 'switchHermesTerminalToChat')).toBeUndefined()
  })

  it('offers the Hermes chat row from the host identity when the tab omits launchAgent', () => {
    const actions = buildActions({
      tabs: [{ type: 'terminal', id: 'tab-h', terminal: 'terminal-1' }],
      hostAgentIdentity: 'hermes',
      hermesResumeSupported: true
    })
    expect(actions.find((action) => action.id === 'startHermesChat')?.label).toBe('Start new chat')
  })

  it('does not promise a Hermes resume the host cannot load', () => {
    const actions = buildActions({
      tabs: [
        {
          type: 'terminal',
          id: 'tab-h',
          terminal: 'terminal-1',
          launchAgent: 'hermes',
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial agentStatus fixture; the action builder reads only providerSession
          agentStatus: {
            providerSession: { key: 'session_id', id: '20261031_144415_71256d' }
          } as never
        }
      ],
      structuredAgents: ['hermes']
    })
    expect(actions.find((action) => action.id === 'startHermesChat')?.label).toBe('Start new chat')
  })

  it('still offers chat view on a Claude terminal', () => {
    const actions = buildActions({
      tabs: [{ type: 'terminal', id: 'tab-c', terminal: 'terminal-1', launchAgent: 'claude' }],
      structuredAgents: ['hermes', 'claude']
    })
    expect(actions.find((action) => action.id === 'toggleChatView')?.label).toBe(
      'Switch to chat view'
    )
    expect(actions.find((action) => action.id === 'structuredChatUnavailable')).toBeUndefined()
  })

  it('still offers a Hermes chat when the registry listed other agents and omitted Hermes', () => {
    const actions = buildActions({
      tabs: [{ type: 'terminal', id: 'tab-h', terminal: 'terminal-1', launchAgent: 'hermes' }],
      structuredAgents: ['claude']
    })
    expect(actions.find((action) => action.id === 'startHermesChat')?.label).toBe('Start new chat')
  })

  it('still explains that another structured terminal cannot become a chat', () => {
    const actions = buildActions({
      tabs: [{ type: 'terminal', id: 'tab-g', terminal: 'terminal-1', launchAgent: 'gemini' }],
      structuredAgents: ['gemini']
    })
    expect(actions.find((action) => action.id === 'structuredChatUnavailable')).toMatchObject({
      disabled: true,
      label: "Can't switch this Gemini terminal to Chat"
    })
  })
})
