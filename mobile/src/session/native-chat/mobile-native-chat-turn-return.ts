import { useMobileNativeChatTerminalTurn } from '../use-mobile-native-chat-terminal-turn'
import { terminalQueueFields, type useMobileTerminalChatQueue } from './use-mobile-terminal-chat-queue'

type Turn = ReturnType<typeof useMobileNativeChatTerminalTurn>
type Queue = ReturnType<typeof useMobileTerminalChatQueue>

export function nativeChatSessionFields<
  TStructured extends {
    isWorking: boolean
    turnIndicator: unknown
    turnJournal: unknown
    receipts: unknown
    actionablePromptIds: unknown
    commandRefusalCauses: unknown
    canStop: boolean
    cancel: Turn['stop']
    backgroundTasks: unknown
    contextUsage: unknown
    interruptedContinue: unknown
    threadGoal: unknown
    rewind: unknown
    queued: unknown
    sendFollowUp: Queue['sendFollowUp']
  },
  TSend extends Queue extends { bindSend: (...args: infer _A) => infer R } ? R extends { send: infer S } ? S : never : never,
  TOutcome extends Queue extends { bindSend: (...args: infer _A) => infer R } ? R extends { sendWithOutcome: infer S } ? S : never : never,
  TBind extends Parameters<Queue['bindSend']>
>(args: {
  activeChatStructured: boolean
  structuredNativeChat: TStructured
  terminalTurn: Turn
  activeTurn: { workingStartedAt: number | null; settledTurns: Turn['settledTurns'] }
  nativeChatAgentWorking: boolean
  terminalQueue: Queue
  captureSendOrigin: TBind[0]
  clearDraftForSend: TBind[1]
  handleNativeChatSend: TSend
  handleNativeChatSendWithOutcome: TOutcome
  structuredNativeChatSend: { send: TSend; sendWithOutcome: TOutcome }
}) {
  const { activeChatStructured, structuredNativeChat, terminalTurn, activeTurn, terminalQueue } = args
  return {
    nativeChatTurnActive: activeChatStructured ? structuredNativeChat.isWorking : terminalTurn.turnActive,
    nativeChatAwaitingInput: activeChatStructured ? null : terminalTurn.awaitingInput,
    nativeChatTurnIndicator: activeChatStructured ? structuredNativeChat.turnIndicator : null,
    nativeChatWorkingStartedAt: activeTurn.workingStartedAt,
    nativeChatSettledTurns: activeTurn.settledTurns,
    nativeChatTurnJournal: activeChatStructured ? structuredNativeChat.turnJournal : null,
    nativeChatReceipts: activeChatStructured ? structuredNativeChat.receipts : null,
    nativeChatActionablePromptIds: structuredNativeChat.actionablePromptIds,
    nativeChatCommandRefusalCauses: structuredNativeChat.commandRefusalCauses,
    nativeChatCanStop: activeChatStructured ? structuredNativeChat.canStop : args.nativeChatAgentWorking,
    ...terminalQueueFields({
      structured: activeChatStructured,
      queue: terminalQueue,
      structuredFollowUp: structuredNativeChat.sendFollowUp,
      bind: [args.captureSendOrigin, args.clearDraftForSend, args.handleNativeChatSendWithOutcome] as TBind,
      structuredSend: args.structuredNativeChatSend,
      plain: { send: args.handleNativeChatSend, sendWithOutcome: args.handleNativeChatSendWithOutcome }
    }),
    nativeChatStreamingText: terminalTurn.streamingText,
    handleNativeChatStop: activeChatStructured ? structuredNativeChat.cancel : terminalTurn.stop,
    nativeChatQueued: terminalQueue.enabled ? terminalQueue.controls : structuredNativeChat.queued,
    nativeChatBackgroundTasks: activeChatStructured ? structuredNativeChat.backgroundTasks : null,
    nativeChatContextUsage: activeChatStructured ? structuredNativeChat.contextUsage : null,
    nativeChatInterruptedContinue: activeChatStructured ? structuredNativeChat.interruptedContinue : null,
    nativeChatThreadGoal: activeChatStructured ? structuredNativeChat.threadGoal : null,
    nativeChatRewind: activeChatStructured ? structuredNativeChat.rewind : undefined
  }
}
