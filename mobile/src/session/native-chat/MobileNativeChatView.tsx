import type { NativeChatSkillDiscoverySnapshot } from '../../../../src/shared/native-chat/input/native-chat-picker-items'
import { MobileStateView } from '../../components/MobileStateView'
import { useMemo, type ComponentProps } from 'react'
import { nativeChatTaskListPredecessors } from '../../../../src/shared/native-chat/input/native-chat-task-list-history'
import {
  MobileNativeChatDisclosureContext,
  useMobileNativeChatDisclosures
} from './transcript/mobile-native-chat-disclosure-store'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import type { NativeChatMessage } from '../../../../src/shared/native-chat/native-chat-types'
import type {
  NativeChatLiveTurnIndicator,
  NativeChatSettledTurns
} from '../../../../src/shared/native-chat/transcript/native-chat-turn-status'
import type { NativeChatTurnJournal } from '../../../../src/shared/native-chat/transcript/native-chat-turn-membership'
import type { NativeChatResolvedPrompt } from '../../../../src/shared/native-chat/native-chat-resolution-receipt'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { styles } from './mobile-native-chat-view-styles'
import { MobileNativeChatEmptyStateView } from '../MobileNativeChatEmptyStateView'
import { mobileNativeChatListFooter } from './mobile-native-chat-list-footer'
import { mobileNativeChatListHeader } from './mobile-native-chat-list-header'
import {
  mobileNativeChatEmptyState,
  type MobileNativeChatPendingItem
} from './mobile-native-chat-render-data'
import { useMobileNativeChatRowKeys } from './transcript/mobile-native-chat-row-keys'
import { useMobileNativeChatPinchGesture } from './transcript/use-mobile-native-chat-pinch-gesture'
import { useMobileNativeChatTailFollow } from './transcript/use-mobile-native-chat-tail-follow'
import { useMobileNativeChatTurnDisclosure } from './transcript/use-mobile-native-chat-turn-disclosure'
import {
  mobileNativeChatComposerPlaceholder,
  useSettledMobileNativeChatInputLock
} from './use-mobile-native-chat-input-lease'
import { mobileNativeChatLiveStatus } from './transcript/mobile-native-chat-live-status'
import type { NativeChatAwaitingInput } from '../../../../src/shared/native-chat/native-chat-terminal-turn'
import { MobileNativeChatFloatingControls } from './MobileNativeChatFloatingControls'
import type { PendingNativeChatImage } from './composer/mobile-native-chat-image-attachment'
import {
  MobileNativeChatDraftComposer,
  type MobileNativeChatSendProps,
  type MobileNativeChatStructuredComposer
} from './composer/MobileNativeChatComposer'
import { MobileNativeChatPromptCard } from './input/MobileNativeChatPromptCard'
import type { MobileNativeChatMicProps } from './composer/MobileNativeChatComposerMic'
import { useMobileNativeChatPromptInputOwner } from './input/use-mobile-native-chat-prompt-input-owner'
import {
  NO_COMPOSER_TRAY,
  type ComposerTrayProps
} from './composer/use-mobile-native-chat-composer-tray'
import type { MobileNativeChatSessionOptionPickersProps } from './input/MobileNativeChatSessionOptionPickers'
import { MobileNativeChatScrollRootsBoundary } from '../MobileNativeChatScrollRootsBoundary'
import { MobileNativeChatRowList } from './transcript/MobileNativeChatRowList'
import { useMobileNativeChatRowRenderer } from './transcript/use-mobile-native-chat-row-renderer'
import { useMobileNativeChatListActions } from './use-mobile-native-chat-list-actions'
import { MobileNativeChatOpenSubagentProvider } from './input/mobile-native-chat-open-subagent'
import { MobileNativeChatActivityBar } from './input/MobileNativeChatActivityBar'
import { useMobileNativeChatSubagentTranscript } from './input/use-mobile-native-chat-subagent-transcript'
import type { NativeChatSubagentActivity } from '../../../../src/shared/native-chat/input/native-chat-activity'
import type { MobileDismissedSubagentScope } from './input/use-mobile-dismissed-subagents'
import type { MobileNativeChatSubagentRead } from './input/use-mobile-native-chat-subagent-page'
import type { MobileNativeChatStatus } from './use-mobile-native-chat-session'
import type { OlderPagePhase } from '../use-mobile-older-page-loader'

export type MobileNativeChatInputLockReason = 'disconnected' | 'waiting'

type Props = ComposerTrayProps & MobileNativeChatMicProps & ChatViewProps

type ChatViewProps = MobileNativeChatSendProps &
  Omit<ComponentProps<typeof MobileNativeChatPromptCard>, 'answering' | 'requiresTerminal'> & {
    // Keep raw messages to distinguish loading from a loaded transcript filtered to empty.
    messages: NativeChatMessage[]
    folded: NativeChatMessage[]
    status: MobileNativeChatStatus
    error?: string
    // Permanent read failure replaces the pane because further chat actions cannot succeed.
    readFailedFinally?: boolean
    agent?: string | null
    sessionLive?: boolean
    /** The turn is live: working, or waiting on the reader. */
    agentWorking?: boolean
    canStop?: boolean
    awaitingInput?: NativeChatAwaitingInput | null
    structuredActivityUi?: boolean
    turnIndicator?: NativeChatLiveTurnIndicator | null
    workingStartedAt?: number | null
    settledTurns?: NativeChatSettledTurns | null
    turnJournal?: NativeChatTurnJournal | null
    receipts?: ReadonlyMap<string, NativeChatResolvedPrompt> | null
    actionablePromptIds?: readonly string[]
    onStop?: () => void
    // The overlay already gates partial text against authoritative transcript replacement.
    streaming: string | null
    hasMore?: boolean
    olderPages?: OlderPagePhase
    onLoadEarlier?: () => void
    // Fence send completion by route identity after tab/view switches.
    sendSurfaceId: string
    getSendCompletionGeneration: () => number
    getComposerEditGeneration: () => number
    pending: MobileNativeChatPendingItem[]
    // Retain local preview URIs after authoritative image messages replace optimistic rows.
    imagePreviewsByMessageId?: Record<string, string[]>
    composerScopeKey?: string | null
    draftKey: string | null
    onComposerTextChange: (text: string) => void
    onAttachImage?: () => void
    attachments?: PendingNativeChatImage[]
    onRemoveAttachment?: (id: string) => void
    isAttaching?: boolean
    inputLockReason?: MobileNativeChatInputLockReason | null
    // Report send failures here only while mounted; the route uses a toast otherwise.
    sendErrorMessage?: string | null
    onClearSendError?: () => void
    filePaths?: string[]
    onNeedFiles?: (query: string) => void
    skillDiscovery?: NativeChatSkillDiscoverySnapshot
    onNeedSkills?: () => void
    sessionOptions?: MobileNativeChatSessionOptionPickersProps | null
    structuredComposer?: MobileNativeChatStructuredComposer | null
    askRequiresTerminal?: boolean
    promptKey?: string | null
    onOpenFile?: (relativePath: string) => void
    keyboardInset?: number
    subagentSeed?: readonly NativeChatSubagentActivity[] | null
    readSubagentPage?: MobileNativeChatSubagentRead | null
    dismissalScope?: MobileDismissedSubagentScope | null
  }

export function MobileNativeChatView({
  messages,
  folded,
  status,
  error,
  readFailedFinally = false,
  agent,
  sessionLive,
  agentWorking,
  canStop = agentWorking,
  sendFollowUp,
  awaitingInput = null,
  structuredActivityUi = false,
  turnIndicator = null,
  workingStartedAt,
  settledTurns,
  turnJournal = null,
  receipts = null,
  actionablePromptIds,
  onStop,
  streaming,
  hasMore,
  olderPages = 'idle',
  onLoadEarlier,
  onSend,
  sendSurfaceId,
  getSendCompletionGeneration,
  getComposerEditGeneration,
  pending,
  imagePreviewsByMessageId,
  draftKey,
  composerScopeKey,
  onComposerTextChange,
  onAttachImage,
  attachments,
  onRemoveAttachment,
  isAttaching,
  onMicPress,
  micActive,
  micStarting,
  micProcessing,
  dictationMode,
  onMicPressIn,
  onMicPressOut,
  inputLockReason,
  sendErrorMessage,
  onClearSendError,
  filePaths,
  onNeedFiles,
  skillDiscovery,
  onNeedSkills,
  sessionOptions,
  structuredComposer: structured = null,
  ask,
  askKey,
  onDismissAsk,
  onAnswerAsk,
  askPending,
  askSendSource,
  askRequiresTerminal = false,
  onAnswerInTerminal,
  onCancelAsk,
  onCancelPrompt,
  onCollapseAsk,
  onCollapsePrompt,
  collapsedPrompt,
  question,
  onAnswerQuestion,
  permission,
  promptKey,
  onRespondPermission,
  composerTray: { content: trayContent, composerInputRef: inputRef } = NO_COMPOSER_TRAY,
  onOpenFile,
  subagentSeed = null,
  readSubagentPage = null,
  dismissalScope = null,
  keyboardInset = 0
}: Props): React.JSX.Element {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const insets = useSafeAreaInsets()
  const bottomPad = keyboardInset > 0 ? keyboardInset + insets.bottom : insets.bottom
  const { fontScale, pinchGesture } = useMobileNativeChatPinchGesture()
  const subagent = useMobileNativeChatSubagentTranscript({
    messages,
    folded,
    streaming,
    pending,
    imagePreviewsByMessageId,
    mainHistory: { hasMore, olderPages, loadEarlier: onLoadEarlier },
    agent,
    sendSurfaceId,
    subagentSeed,
    readSubagentPage
  })
  const { data } = subagent
  const tail = useMobileNativeChatTailFollow({ hasItems: data.length > 0, scopeKey: sendSurfaceId })
  const { jumpToTail, recordScrollMetrics, scrollMayLoadEarlier } = tail

  const { handleSend, loadEarlier, loadEarlierNearTop, onScroll } = useMobileNativeChatListActions({
    onSend,
    onClearSendError,
    jumpToTail,
    history: subagent.history,
    recordScrollMetrics,
    scrollMayLoadEarlier
  })

  const turns = useMobileNativeChatTurnDisclosure({
    messages: data,
    enabled: true,
    isWorking: subagent.focusedId ? false : agentWorking === true,
    workingStartedAt,
    settledTurns,
    turnJournal,
    thinking: subagent.focusedId ? false : turnIndicator?.thinking === true,
    activityText: subagent.focusedId ? null : (turnIndicator?.activityText ?? null),
    stopping: subagent.focusedId ? false : turnIndicator?.stopping === true,
    lineYields: subagent.focusedId ? false : ask != null || permission != null || question != null,
    receipts,
    scopeKey: subagent.scopeKey
  })

  const rowKeys = useMobileNativeChatRowKeys(
    subagent.shownFolded,
    subagent.rowSource,
    subagent.scopeKey,
    turns.presentation
  )
  const disclosures = useMobileNativeChatDisclosures(sendSurfaceId)
  const taskListPredecessors = useMemo(() => nativeChatTaskListPredecessors(data), [data])
  const renderItem = useMobileNativeChatRowRenderer({
    scope: sendSurfaceId,
    rowKeyOf: rowKeys.keyOf,
    runOwners: rowKeys.runOwners,
    taskListPredecessors,
    fontScale,
    onOpenFile,
    structuredActivityUi,
    turns,
    turnJournal,
    agent,
    receipts,
    actionablePromptIds
  })

  const liveStatus = mobileNativeChatLiveStatus({
    hidden: subagent.focusedId != null,
    awaitingInput,
    line: turns.liveLine,
    onToggleReasoning: turns.onToggleReasoning,
    fontScale,
    onOpenFile
  })

  const header = mobileNativeChatListHeader(
    subagent.history.hasMore,
    subagent.history.olderPages,
    loadEarlier
  )
  // Changing text scale relays out every row, so preserve the page’s reading anchor.
  const layoutKey = `${fontScale}`
  const footer = mobileNativeChatListFooter(liveStatus, turns.waitingRows, renderItem)
  const emptyState = mobileNativeChatEmptyState(status, agent ?? null, error, sessionLive)
  const suppressEmptyState = subagent.focusedId != null && !readFailedFinally

  const lockReason = useSettledMobileNativeChatInputLock(inputLockReason)
  const composerPlaceholder = mobileNativeChatComposerPlaceholder(
    lockReason,
    turnIndicator?.afterStop
  )
  // Lock only terminal-backed Send: it can answer an agent prompt, while drafting is harmless and structured sends queue.
  const promptShown = !collapsedPrompt && (ask ?? permission ?? question) != null
  const expandedPromptOwnsSend = !structuredActivityUi && promptShown
  const promptOwnsInput = useMobileNativeChatPromptInputOwner(
    { promptShown, ask, askRequiresTerminal, permission, micActive, micProcessing },
    inputRef
  )
  const emptyStateView =
    emptyState && !suppressEmptyState ? <MobileNativeChatEmptyStateView copy={emptyState} /> : null

  if (readFailedFinally && emptyStateView) {
    return <View style={[styles.root, { paddingBottom: bottomPad }]}>{emptyStateView}</View>
  }

  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
      {status === 'loading' && messages.length === 0 ? (
        <MobileStateView
          loading
          title={t('session.nativeChatView.loading', 'Loading conversation…')}
        />
      ) : (
        <GestureHandlerRootView style={styles.listWrap}>
          <MobileNativeChatDisclosureContext.Provider value={disclosures}>
            <MobileNativeChatOpenSubagentProvider onOpen={subagent.onFocusSubagent}>
              <MobileNativeChatScrollRootsBoundary
                {...{ rowKeys, layoutKey }}
                roots={disclosures.roots}
                runPlacements={rowKeys.runPlacements}
              >
                <GestureDetector gesture={pinchGesture}>
                  <MobileNativeChatRowList
                    {...{ tail, rowKeys, renderItem, footer, emptyStateView, onScroll, layoutKey }}
                    {...{
                      header,
                      hasHeader: subagent.history.hasMore === true,
                      onNearTop: loadEarlierNearTop
                    }}
                    rows={turns.listMessages}
                    runs={turns.presentation.workRuns.heads}
                    roots={disclosures.roots}
                    contentContainerStyle={styles.listContent}
                  />
                </GestureDetector>
              </MobileNativeChatScrollRootsBoundary>
            </MobileNativeChatOpenSubagentProvider>
          </MobileNativeChatDisclosureContext.Provider>
          <MobileNativeChatFloatingControls
            showJumpToTail={tail.showJumpToTail}
            onJumpToTail={jumpToTail}
          />
        </GestureHandlerRootView>
      )}
      <MobileNativeChatPromptCard
        key={promptKey ?? undefined}
        answering={promptOwnsInput && keyboardInset > 0}
        {...{ askPending, askSendSource }}
        {...{ ask, askKey, onDismissAsk, onAnswerAsk, onCancelAsk, onCancelPrompt, onCollapseAsk }}
        requiresTerminal={askRequiresTerminal}
        onAnswerInTerminal={onAnswerInTerminal}
        {...{ permission, onRespondPermission, question, onAnswerQuestion, onCollapsePrompt }}
        collapsedPrompt={collapsedPrompt}
      />
      <Text
        style={lockReason === 'waiting' ? styles.inputLockStatus : undefined}
        accessibilityLiveRegion="polite"
      >
        {lockReason === 'waiting' ? composerPlaceholder : null}
      </Text>
      {sendErrorMessage ? (
        // This banner is the only channel for a send failure — announce it.
        <View
          style={styles.sendError}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={styles.sendErrorText}>{sendErrorMessage}</Text>
        </View>
      ) : null}
      <MobileNativeChatActivityBar {...subagent.activityBar} dismissalScope={dismissalScope} />
      {trayContent}
      <View style={promptOwnsInput ? styles.hidden : undefined}>
        <MobileNativeChatDraftComposer
          draftScopeKey={composerScopeKey}
          structured={structuredActivityUi && structured ? { ...structured, onOpenFile } : null}
          draftKey={draftKey}
          onChangeText={onComposerTextChange}
          onSend={handleSend}
          sendSurfaceId={sendSurfaceId}
          {...{ getSendCompletionGeneration, getComposerEditGeneration, inputRef, sendFollowUp }}
          agent={agent}
          sessionOptions={sessionOptions}
          onAttachImage={onAttachImage}
          attachments={attachments}
          onRemoveAttachment={onRemoveAttachment}
          isAttaching={isAttaching}
          onMicPress={onMicPress}
          micActive={micActive}
          micStarting={micStarting}
          micProcessing={micProcessing}
          dictationMode={dictationMode}
          onMicPressIn={onMicPressIn}
          onMicPressOut={onMicPressOut}
          disabled={lockReason !== null}
          sendDisabled={expandedPromptOwnsSend}
          placeholder={composerPlaceholder}
          filePaths={filePaths}
          onNeedFiles={onNeedFiles}
          skillDiscovery={skillDiscovery}
          onNeedSkills={onNeedSkills}
          stop={canStop ? { onStop, held: turnIndicator?.stopRequestInFlight === true } : null}
        />
      </View>
    </View>
  )
}
