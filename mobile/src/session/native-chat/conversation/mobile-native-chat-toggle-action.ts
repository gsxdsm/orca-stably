import { MessageSquare, SquareTerminal } from 'lucide-react-native'
import type { ActionSheetAction } from '../../../components/sheets/ActionSheetModal'
import type { Translate } from '../../../i18n/mobile-i18n'
import { formatAgentTypeLabel } from '../../../../../src/shared/agent-status/presentation/agent-type-label'
import { isNativeChatSupportedAgent } from '../../../../../src/shared/native-chat/native-chat-agent-support'
import { resolveMobileNativeChat, type MobileNativeChatTab } from './mobile-native-chat-eligibility'

type ToggleTab = MobileNativeChatTab & {
  id: string
  terminal: string | null
}

export function getMobileNativeChatToggleActions(args: {
  terminalHandle: string | null
  tabs: readonly ToggleTab[]
  isTabChatView: (tabId: string) => boolean
  nativeChatTranscriptIsLocalReadable: boolean
  hermesOverlaySupported?: boolean
  structuredAgents?: readonly string[]
  /** terminal.list identity. Used only when the tab itself does not name an agent, and only for Hermes. */
  hostAgentIdentity?: string | null
  onClose: () => void
  onToggle: (tabId: string) => void
  t: Translate
}): ActionSheetAction[] {
  const { terminalHandle, tabs, isTabChatView, onClose, onToggle } = args
  const tab = terminalHandle
    ? tabs.find((candidate) => candidate.terminal === terminalHandle)
    : null
  if (!tab) {
    return []
  }
  if (
    !resolveMobileNativeChat(
      tab,
      args.nativeChatTranscriptIsLocalReadable,
      args.hermesOverlaySupported
    )
  ) {
    if (
      (terminalLaunchAgent(tab) ?? args.hostAgentIdentity) === 'hermes' &&
      !args.hermesOverlaySupported
    ) {
      return []
    }
    return structuredChatTerminalExplanation(tab, args.structuredAgents ?? [], args.t)
  }
  const isChat = isTabChatView(tab.id)
  return [
    {
      id: 'toggleChatView',
      label: isChat
        ? args.t('session.nativeChatToggleAction.switchToTerminalView', 'Switch to terminal')
        : args.t('session.nativeChatToggleAction.switchToChatView', 'Switch to chat'),
      icon: isChat ? SquareTerminal : MessageSquare,
      onPress: () => {
        onClose()
        onToggle(tab.id)
      }
    }
  ]
}

function terminalLaunchAgent(tab: MobileNativeChatTab): string | null {
  return tab.launchAgent ?? tab.agentStatus?.agentType ?? tab.agent ?? null
}

// A structured chat is a new session. The running terminal has no transcript this view can adopt.
function structuredChatTerminalExplanation(
  tab: MobileNativeChatTab,
  structuredAgents: readonly string[],
  t: Translate
): ActionSheetAction[] {
  const agent = terminalLaunchAgent(tab)
  if (!agent || isNativeChatSupportedAgent(agent) || !structuredAgents.includes(agent)) {
    return []
  }
  return [
    {
      id: 'structuredChatUnavailable',
      label: t(
        'session.nativeChatToggleAction.terminalCannotSwitchToChat',
        "Can't switch this {{agent}} terminal to Chat",
        { agent: formatAgentTypeLabel(agent) }
      ),
      hint: t(
        'session.nativeChatToggleAction.startNewChatSession',
        'Start a new session with Chat UI on'
      ),
      icon: MessageSquare,
      disabled: true,
      onPress: () => {}
    }
  ]
}
