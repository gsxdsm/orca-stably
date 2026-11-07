import { MobileStateView } from '../../components/MobileStateView'
import { useCallback, useMemo } from 'react'
import { nativeChatTaskListPredecessors } from '../../../../src/shared/native-chat/input/native-chat-task-list-history'
import {
  MobileNativeChatDisclosureContext,
  useMobileNativeChatDisclosures
} from './transcript/mobile-native-chat-disclosure-store'
import { MobileNativeChatOpenSubagentProvider } from './input/mobile-native-chat-open-subagent'
import { type NativeScrollEvent, type NativeSyntheticEvent, View } from 'react-native'
import { MobileNativeChatSendErrorBanner } from './MobileNativeChatSendErrorBanner'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { MobileNativeChatInputLockStatus } from './composer/MobileNativeChatInputLockStatus'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { styles } from './mobile-native-chat-view-styles'
import { MobileNativeChatEmptyStateView } from '../MobileNativeChatEmptyStateView'
import { MobileNativeChatActivityBar } from './input/MobileNativeChatActivityBar'
import { useMobileNativeChatSubagentTranscript } from './input/use-mobile-native-chat-subagent-transcript'
import { useChatBottomFit } from './composer/use-chat-bottom-fit'
import type { MobileNativeChatViewProps } from '../mobile-native-chat-view-props'
import { mobileNativeChatListFooter } from './mobile-native-chat-list-footer'
import { mobileNativeChatListHeader } from './mobile-native-chat-list-header'
import { mobileNativeChatEmptyState } from './mobile-native-chat-render-data'
import { useMobileNativeChatTransientData } from './transcript/use-mobile-native-chat-transient-data'
import { useMobileNativeChatRowKeys } from './transcript/mobile-native-chat-row-keys'
import { useMobileNativeChatPinchGesture } from './transcript/use-mobile-native-chat-pinch-gesture'
import { useMobileNativeChatTailFollow } from './transcript/use-mobile-native-chat-tail-follow'
import { useMobileNativeChatTurnDisclosure } from './transcript/use-mobile-native-chat-turn-disclosure'
import {
  mobileNativeChatComposerPlaceholder,
  useSettledMobileNativeChatInputLock
} from './use-mobile-native-chat-input-lease'
import { MobileNativeChatLiveLine } from './transcript/MobileNativeChatLiveLine'
import { MobileNativeChatAwaitingInputRow } from './transcript/MobileNativeChatAwaitingInputRow'
import { MobileNativeChatOpenFileContext } from './mobile-native-chat-open-file-context'
import { MobileNativeChatDraftComposer } from './composer/MobileNativeChatComposer'
import { DuoRailComposerTop, MobileNativeChatJumpControls } from '../duo-rail-jump-controls'
import { useMobileNativeChatPreviousStops } from './transcript/use-mobile-native-chat-previous-stops'
import { MobileNativeChatPromptCard } from './input/MobileNativeChatPromptCard'
import { useMobileNativeChatPromptInputOwner } from './input/use-mobile-native-chat-prompt-input-owner'
import { NO_COMPOSER_TRAY } from './composer/use-mobile-native-chat-composer-tray'
import { MobileNativeChatScrollRootsBoundary } from '../MobileNativeChatScrollRootsBoundary'
import { MobileNativeChatRowList } from './transcript/MobileNativeChatRowList'
import { useMobileNativeChatRowRenderer } from './transcript/use-mobile-native-chat-row-renderer'
import { MobileNativeChatLowerRegion } from './MobileNativeChatLowerRegion'

export type { MobileNativeChatInputLockReason } from '../mobile-native-chat-view-props'

export function MobileNativeChatView({
  messages,
  folded,
  taskList = null,
  subagentSeed = null,
  readSubagentPage = null,
  initialSubagentId = null,
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
  onPasteImages,
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
  hostOutage = null,
  sendErrorMessage,
  onClearSendError,
  onDismissSendError,
  filePaths,
  onNeedFiles,
  skillDiscovery,
  onNeedSkills,
  sessionOptions,
  contextUsage = null,
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
  composerTray: { content: trayContent, composerInputRef: inputRef, steerHead } = NO_COMPOSER_TRAY,
  onOpenFile,
  dismissalScope = null,
  keyboardInset = 0,
  activityBar = null
}: MobileNativeChatViewProps): React.JSX.Element {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { bottomPad, composerFit, transcriptInset } = useChatBottomFit(keyboardInset)
  const { fontScale, scaleReady, pinchGesture, pinchTarget } = useMobileNativeChatPinchGesture()
  const subagent = useMobileNativeChatSubagentTranscript({
    messages,
    folded,
    streaming,
    pending,
    agent,
    sendSurfaceId,
    taskList,
    subagentSeed,
    readSubagentPage,
    initialSubagentId
  })
  const historyHasMore = subagent.childHistory?.hasMore ?? hasMore
  const historyOlderPages = subagent.childHistory?.olderPages ?? olderPages
  const onHistoryLoadEarlier = subagent.childHistory?.loadEarlier ?? onLoadEarlier

  const data = useMobileNativeChatTransientData(
    {
      folded: subagent.shownFolded,
      streaming: subagent.shownStreaming,
      pending: subagent.shownPending,
      imagePreviewsByMessageId: subagent.focusedId ? undefined : imagePreviewsByMessageId
    },
    subagent.focusedId ? `${sendSurfaceId}\0${subagent.focusedId}` : sendSurfaceId
  )
  const tail = useMobileNativeChatTailFollow({ hasItems: data.length > 0, scopeKey: sendSurfaceId })
  const { jumpToTail, recordScrollMetrics, scrollMayLoadEarlier, jumpToPreviousMessage } = tail

  const handleSend = useCallback(
    async (...send: Parameters<typeof onSend>): Promise<boolean> => {
      // Retire the previous notice before this action can report a new one.
      onClearSendError?.()
      const accepted = await onSend(...send)
      if (!accepted) {
        return false
      }
      jumpToTail()
      return true
    },
    [onSend, onClearSendError, jumpToTail]
  )

  const loadEarlier = useCallback(() => onHistoryLoadEarlier?.(), [onHistoryLoadEarlier])
  // After failure require a tap; automatic near-top retries could spin forever.
  const loadEarlierNearTop =
    historyHasMore && historyOlderPages === 'idle' ? loadEarlier : undefined

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset } = e.nativeEvent
      recordScrollMetrics(e.nativeEvent)
      // Only reader drags trigger native pagination; tail-pin offsets may also look near-top.
      if (contentOffset.y < 60 && scrollMayLoadEarlier()) {
        loadEarlierNearTop?.()
      }
    },
    [loadEarlierNearTop, scrollMayLoadEarlier, recordScrollMetrics]
  )

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
    scopeKey: subagent.focusedId ? `${sendSurfaceId}\0${subagent.focusedId}` : sendSurfaceId
  })

  const rowKeys = useMobileNativeChatRowKeys(
    subagent.shownFolded,
    subagent.rowSource,
    subagent.focusedId ? `${sendSurfaceId}\0${subagent.focusedId}` : sendSurfaceId,
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
    structuredActivityUi,
    turns,
    turnJournal,
    agent,
    receipts,
    actionablePromptIds
  })

  const liveStatus = subagent.focusedId ? null : awaitingInput === 'unshown' ? (
    <MobileNativeChatAwaitingInputRow subject={null} pending fontScale={fontScale} />
  ) : turns.liveLine ? (
    <MobileNativeChatLiveLine
      line={turns.liveLine}
      onToggleReasoning={turns.onToggleReasoning}
      fontScale={fontScale}
    />
  ) : null

  const header = mobileNativeChatListHeader(historyHasMore, historyOlderPages, loadEarlier)
  // Changing text scale relays out every row, so preserve the page’s reading anchor.
  const layoutKey = `${fontScale}`
  useMobileNativeChatPreviousStops(tail, turns, rowKeys.keyOf, layoutKey)
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

  // The stored size is already in fontScale when the page cache was published. Otherwise wait.
  if (!scaleReady) {
    return <View style={[styles.root, { paddingBottom: bottomPad }]} />
  }

  const lowerContent = (
    <>
      <MobileNativeChatPromptCard
        key={promptKey ?? undefined}
        answering={promptOwnsInput && keyboardInset > 0}
        {...{ askPending, askSendSource }}
        {...{
          ask,
          askKey,
          onDismissAsk,
          onAnswerAsk,
          onCancelAsk,
          onCancelPrompt,
          onCollapseAsk
        }}
        requiresTerminal={askRequiresTerminal}
        onAnswerInTerminal={onAnswerInTerminal}
        {...{ permission, onRespondPermission, question, onAnswerQuestion, onCollapsePrompt }}
        collapsedPrompt={collapsedPrompt}
      />
      <MobileNativeChatInputLockStatus
        lockReason={lockReason}
        waitingText={composerPlaceholder}
        hostOutage={hostOutage}
      />
      <MobileNativeChatSendErrorBanner message={sendErrorMessage} onDismiss={onDismissSendError} />
      {trayContent}
      <MobileNativeChatActivityBar
        list={subagent.taskList}
        subagents={subagent.subagents}
        focused={subagent.focused}
        focusedTranscriptEmpty={subagent.focusedTranscriptEmpty}
        fontScale={fontScale}
        onFocusSubagent={subagent.onFocusSubagent}
        dismissalScope={dismissalScope}
        accessory={activityBar}
      />
      <DuoRailComposerTop keyboardInset={keyboardInset} hidden={promptOwnsInput}>
        <MobileNativeChatDraftComposer
          {...composerFit}
          draftScopeKey={composerScopeKey}
          structured={structuredActivityUi ? structured : null}
          draftKey={draftKey}
          onChangeText={onComposerTextChange}
          onSend={handleSend}
          sendSurfaceId={sendSurfaceId}
          {...{
            getSendCompletionGeneration,
            getComposerEditGeneration,
            inputRef,
            sendFollowUp,
            steerHead
          }}
          {...{ agent, sessionOptions, contextUsage }}
          {...{ onAttachImage, onPasteImages, attachments, onRemoveAttachment }}
          {...{ isAttaching, onMicPress, micActive, micStarting, micProcessing }}
          {...{ dictationMode, onMicPressIn, onMicPressOut }}
          disabled={lockReason !== null}
          sendDisabled={expandedPromptOwnsSend}
          placeholder={composerPlaceholder}
          {...{ filePaths, onNeedFiles, skillDiscovery, onNeedSkills }}
          stop={canStop ? { onStop, held: turnIndicator?.stopRequestInFlight === true } : null}
        />
      </DuoRailComposerTop>
    </>
  )

  if (readFailedFinally && emptyStateView) {
    return <View style={[styles.root, { paddingBottom: bottomPad }]}>{emptyStateView}</View>
  }

  return (
    <MobileNativeChatOpenFileContext value={onOpenFile}>
      <View testID="native-chat-view" style={[styles.root, { paddingBottom: bottomPad }]}>
        {status === 'loading' && messages.length === 0 ? (
          <MobileStateView
            loading
            title={t('session.nativeChatView.loading', 'Loading conversation…')}
          />
        ) : (
          <GestureHandlerRootView style={[styles.listWrap, transcriptInset]}>
            <MobileNativeChatDisclosureContext.Provider value={disclosures}>
              <MobileNativeChatOpenSubagentProvider onOpen={subagent.onFocusSubagent}>
                <MobileNativeChatScrollRootsBoundary
                  {...{ rowKeys, layoutKey }}
                  roots={disclosures.roots}
                  runPlacements={rowKeys.runPlacements}
                >
                  <MobileNativeChatRowList
                    {...{ tail, rowKeys, renderItem, footer, emptyStateView, onScroll, layoutKey }}
                    {...{
                      header,
                      hasHeader: historyHasMore === true,
                      onNearTop: loadEarlierNearTop
                    }}
                    pinchGesture={pinchGesture}
                    pinchTarget={pinchTarget}
                    rows={turns.listMessages}
                    runs={turns.presentation.workRuns.heads}
                    roots={disclosures.roots}
                    contentContainerStyle={styles.listContent}
                  />
                </MobileNativeChatScrollRootsBoundary>
              </MobileNativeChatOpenSubagentProvider>
            </MobileNativeChatDisclosureContext.Provider>
            <MobileNativeChatJumpControls
              showJumpToTail={tail.showJumpToTail}
              onJumpToTail={jumpToTail}
              showPreviousMessage={tail.showPreviousMessage}
              onJumpToPrevious={jumpToPreviousMessage}
            />
          </GestureHandlerRootView>
        )}
        <MobileNativeChatLowerRegion scopeKey={sendSurfaceId} composerPresent={!promptOwnsInput}>
          {lowerContent}
        </MobileNativeChatLowerRegion>
      </View>
    </MobileNativeChatOpenFileContext>
  )
}
