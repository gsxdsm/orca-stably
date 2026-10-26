import { Animated, View, Text, Pressable, ActivityIndicator } from 'react-native'
import { useEffect, useRef } from 'react'
import { MobileSessionStatusColumnKeys } from './MobileSessionStatusColumnKeys'
import { useStackedFoldBand } from '../layout/use-stacked-fold-band'
import { saveTerminalTextScale } from '../storage/preferences'
import { MobileBrowserPane } from '../browser/MobileBrowserPane'
import { TerminalPaneView } from './TerminalPaneView'
import { MobileNativeChatOverlay } from './MobileNativeChatOverlay'
import { resolveMobileNativeChatSessionId } from './native-chat/mobile-native-chat-eligibility'
import { colors } from '../theme/mobile-theme'
import { styles } from './mobile-session-styles'
import type { MobileSessionController } from './use-mobile-session-controller'
import { useWorkspaceExecutionHost } from '../navigation/workspace-execution-host'
import { FileReader } from './MobileSessionFileReader'
import { MarkdownReader } from './MobileSessionMarkdownReader'

function insetTerminalFrame(
  size: { width: number; height: number },
  inset: { right: number; bottom: number }
): { width: number; height: number } {
  return {
    width: Math.max(0, size.width - inset.right),
    height: Math.max(0, size.height - inset.bottom)
  }
}

export function MobileSessionActiveContent({
  controller
}: {
  controller: MobileSessionController
}) {
  const executionHost = useWorkspaceExecutionHost()
  const foldBand = useStackedFoldBand()
  const {
    hostId,
    worktreeId,
    insets,
    connState,
    client,
    terminals,
    terminalTextScale,
    setTerminalTextScale,
    terminalTextScaleRevisionRef,
    activeHandle,
    markdownDocs,
    fileDocs,
    diffComments,
    diffCommentBusy,
    createError,
    setCreateError,
    setShowCreateTabDrawer,
    dictationMode,
    dictationEnabled,
    toastMessage,
    handleTerminalTap,
    browserScreencastSupported,
    showToast,
    nativeChatSendError,
    nativeChatOverlayInputLockReason,
    nativeChatController,
    dictation,
    handleDictationToggle,
    handleDictationPressIn,
    handleDictationPressOut,
    readMarkdownTab,
    addDiffCommentForFile,
    deleteDiffCommentForFile,
    copyDiffCommentsToClipboard,
    sendDiffCommentsToAgent,
    sendingDiffCommentIds,
    updateMarkdownLocalContent,
    copyMarkdownLocalContent,
    copyMarkdownPath,
    discardMarkdownLocalContent,
    saveMarkdownTab,
    setTerminalWebViewRef,
    handleTerminalWebReady,
    notifyTerminalFrame,
    notifyTerminalCellBoxChange,
    handleFileTap,
    handleNativeChatFileTap,
    handleTerminalOpenUrl,
    handleTerminalInput,
    handleTerminalQueryReply,
    handleSelectionMode,
    handleSelectionCopy,
    handleSelectionEvicted,
    handleClipboardWrite,
    handleModesChanged,
    handleKeyboardAvoidanceMetrics,
    handleHaptic,
    nativeChatImages,
    nativeChatStructuredComposer,
    activeMarkdownTab,
    activeFileTab,
    activeBrowserTab,
    activePendingTerminalTab,
    isPendingTerminalRecoveryParked,
    retryPendingTerminalRecovery,
    showLoadingState,
    showEmptyState,
    keyboardLift,
    activeTerminalKeyboardLift,
    toastAnimatedStyle,
    createTabBusy
  } = controller
  // Fit the terminal to the pane area, which the status column (folded) and the hinge (laptop) inset.
  const paneInset = {
    right: controller.sessionSideRail === 'fullWidth' ? controller.statusColumnWidth : 0,
    bottom: foldBand.top !== null ? foldBand.height - foldBand.top : 0
  }
  const contentSizeRef = useRef<{ width: number; height: number } | null>(null)
  const { right: paneInsetRight, bottom: paneInsetBottom } = paneInset
  const notifyTerminalFrameRef = useRef(notifyTerminalFrame)
  notifyTerminalFrameRef.current = notifyTerminalFrame
  const lastInsetRef = useRef({ right: paneInsetRight, bottom: paneInsetBottom })
  useEffect(() => {
    // The hinge or fold can move these insets without a new layout of the frame.
    const last = lastInsetRef.current
    if (last.right === paneInsetRight && last.bottom === paneInsetBottom) {
      return
    }
    lastInsetRef.current = { right: paneInsetRight, bottom: paneInsetBottom }
    if (contentSizeRef.current) {
      notifyTerminalFrameRef.current(
        insetTerminalFrame(contentSizeRef.current, lastInsetRef.current)
      )
    }
  }, [paneInsetRight, paneInsetBottom])
  const content = showLoadingState ? (
    <View style={styles.emptyState}>
      <ActivityIndicator size="small" color={colors.textSecondary} />
    </View>
  ) : showEmptyState ? (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>No tabs in this session</Text>
      {createError ? <Text style={styles.createError}>{createError}</Text> : null}
      <View style={styles.emptyActions}>
        <Pressable
          style={[
            styles.createButton,
            (createTabBusy || connState !== 'connected') && styles.createButtonDisabled
          ]}
          disabled={createTabBusy || connState !== 'connected'}
          onPress={() => {
            setCreateError('')
            setShowCreateTabDrawer(true)
          }}
        >
          <Text style={styles.createButtonText}>
            {createTabBusy ? 'Creating...' : 'Create Tab'}
          </Text>
        </Pressable>
      </View>
    </View>
  ) : activeMarkdownTab ? (
    <View style={styles.markdownFrame}>
      <MarkdownReader
        documentId={activeMarkdownTab.id}
        doc={markdownDocs.get(activeMarkdownTab.id)}
        onRefresh={() => void readMarkdownTab(activeMarkdownTab)}
        onChange={(content) => updateMarkdownLocalContent(activeMarkdownTab.id, content)}
        onSave={() => void saveMarkdownTab(activeMarkdownTab)}
        onCopy={() => void copyMarkdownLocalContent(activeMarkdownTab.id)}
        onCopyPath={() => void copyMarkdownPath(activeMarkdownTab)}
        onDiscard={() => discardMarkdownLocalContent(activeMarkdownTab)}
        keyboardLift={keyboardLift}
      />
      {toastMessage && (
        <Animated.View pointerEvents="none" style={[styles.toast, toastAnimatedStyle]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  ) : activeFileTab ? (
    <View style={styles.markdownFrame}>
      <FileReader
        documentId={JSON.stringify([hostId, executionHost, worktreeId, activeFileTab.id])}
        client={client}
        doc={fileDocs.get(activeFileTab.id)}
        title={activeFileTab.title || 'File'}
        relativePath={activeFileTab.relativePath}
        language={activeFileTab.language}
        diffCommentActions={
          activeFileTab.diffSource === 'staged' || activeFileTab.diffSource === 'unstaged'
            ? {
                comments: diffComments,
                sendingCommentIds: sendingDiffCommentIds,
                busy: diffCommentBusy,
                onAdd: addDiffCommentForFile,
                onDelete: deleteDiffCommentForFile,
                onCopyAll: copyDiffCommentsToClipboard,
                onSendAll: sendDiffCommentsToAgent
              }
            : undefined
        }
      />
      {toastMessage && (
        <Animated.View pointerEvents="none" style={[styles.toast, toastAnimatedStyle]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  ) : activeBrowserTab ? (
    <View style={styles.browserFrame}>
      {/* Why: pane owns imperative frame refs; don't render a stale frame while the old stream effect cleans up. */}
      <MobileBrowserPane
        key={activeBrowserTab.browserPageId ?? activeBrowserTab.id}
        client={client}
        worktreeId={worktreeId}
        tab={activeBrowserTab}
        screencastSupported={browserScreencastSupported}
        keyboardLift={keyboardLift}
        bottomInset={insets.bottom}
        onToast={showToast}
      />
      {toastMessage && (
        <Animated.View pointerEvents="none" style={[styles.toast, toastAnimatedStyle]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  ) : activePendingTerminalTab ? (
    <View style={styles.emptyState}>
      {!isPendingTerminalRecoveryParked && (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      )}
      <Text style={styles.emptyText}>
        {isPendingTerminalRecoveryParked
          ? 'Terminal is taking longer than expected'
          : activePendingTerminalTab.title || 'Loading terminal'}
      </Text>
      {isPendingTerminalRecoveryParked && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading terminal"
          style={({ pressed }) => [styles.createButton, pressed && styles.newTerminalButtonPressed]}
          onPress={() => void retryPendingTerminalRecovery()}
        >
          <Text style={styles.createButtonText}>Retry</Text>
        </Pressable>
      )}
    </View>
  ) : (
    <View ref={foldBand.ref} onLayout={foldBand.onLayout} style={styles.terminalFrame}>
      {/* Folded, the status column overlays the top right; the grid stays clear while chat runs full width.
          Half folded laptop-style, the grid ends at the hinge and the input stays below it. */}
      <View
        style={[
          styles.terminalPaneArea,
          controller.sessionSideRail === 'fullWidth' && { right: controller.statusColumnWidth },
          foldBand.top !== null && { bottom: foldBand.height - foldBand.top }
        ]}
      >
        {terminals.map((terminal) => (
          <TerminalPaneView
            key={terminal.handle}
            handle={terminal.handle}
            active={terminal.handle === activeHandle}
            keyboardLift={terminal.handle === activeHandle ? activeTerminalKeyboardLift : 0}
            terminalTheme={terminal.terminalTheme}
            textScale={terminalTextScale}
            onTextScaleChange={(scale) => {
              // Why: pinch-to-zoom reports a new preset; persist it so the size sticks across panes and launches.
              terminalTextScaleRevisionRef.current += 1
              setTerminalTextScale(scale)
              void saveTerminalTextScale(scale)
            }}
            onRef={setTerminalWebViewRef}
            onWebReady={handleTerminalWebReady}
            onCellBoxChange={notifyTerminalCellBoxChange}
            onSelectionMode={handleSelectionMode}
            onSelectionCopy={handleSelectionCopy}
            onSelectionEvicted={handleSelectionEvicted}
            onClipboardWrite={handleClipboardWrite}
            onModesChanged={handleModesChanged}
            onKeyboardAvoidanceMetrics={handleKeyboardAvoidanceMetrics}
            onHaptic={handleHaptic}
            onTerminalInput={handleTerminalInput}
            onTerminalQueryReply={handleTerminalQueryReply}
            onTerminalTap={handleTerminalTap}
            onFileTap={handleFileTap}
            onOpenUrl={handleTerminalOpenUrl}
          />
        ))}
      </View>
      {controller.sessionSideRail === 'fullWidth' &&
      controller.terminalKeysBesideTerminal &&
      !controller.showNativeChat ? (
        <MobileSessionStatusColumnKeys controller={controller} />
      ) : null}
      <MobileNativeChatOverlay
        controller={nativeChatController}
        activeSessionTabId={controller.activeSessionTab?.id}
        onOpenFile={handleNativeChatFileTap}
        images={nativeChatImages}
        structuredComposer={nativeChatStructuredComposer}
        onMicPress={dictationEnabled ? handleDictationToggle : undefined}
        micActive={dictation.isRecording}
        dictationMode={dictationMode}
        onMicPressIn={handleDictationPressIn}
        onMicPressOut={handleDictationPressOut}
        inputLockReason={nativeChatOverlayInputLockReason}
        sendErrorMessage={nativeChatSendError.message}
        onClearSendError={nativeChatSendError.clear}
        sendSurfaceId={controller.nativeChatScopeKey ?? ''}
        sessionId={resolveMobileNativeChatSessionId(controller.activeSessionTab)}
        getSendCompletionGeneration={controller.getSendCompletionGeneration}
        keyboardInset={keyboardLift}
        bottomInset={insets.bottom}
        fitScreenCorners={controller.sessionSideRail === 'fullWidth'}
      />
      {toastMessage && (
        <Animated.View pointerEvents="none" style={[styles.toast, toastAnimatedStyle]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  )
  return (
    <View
      // Why: one frame under every branch; react-native-web observes onLayout only on a View that mounts with it.
      style={styles.contentFrame}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        contentSizeRef.current = { width, height }
        notifyTerminalFrame(insetTerminalFrame({ width, height }, paneInset))
      }}
    >
      {content}
    </View>
  )
}
