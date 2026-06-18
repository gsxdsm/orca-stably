import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { ArrowDown, ChevronsDownUp, ChevronsUpDown, Square } from 'lucide-react-native'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { colors } from '../theme/mobile-theme'
import { clampFontScale } from './mobile-native-chat-message-text'
import { styles } from './mobile-native-chat-view-styles'
import { foldToolMessages } from './mobile-native-chat-blocks'
import { MobileAgentWorkingIndicator } from './MobileAgentWorkingIndicator'
import { MobileNativeChatComposer } from './MobileNativeChatComposer'
import { MobileNativeChatMessage } from './MobileNativeChatMessage'
import { MobileNativeChatPermission } from './MobileNativeChatPermission'
import type { MobileChatPermission } from './mobile-native-chat-permission'
import { MobileNativeChatQuestion } from './MobileNativeChatQuestion'
import type { MobileChatQuestion } from './mobile-native-chat-question'
import type { MobileNativeChatStatus } from './use-mobile-native-chat-session'

type Props = {
  messages: NativeChatMessage[]
  status: MobileNativeChatStatus
  error?: string
  agentWorking?: boolean
  /** Interrupt the agent mid-turn (shown as a Stop button on the working bar). */
  onStop?: () => void
  /** Live partial assistant text while a turn is still streaming (from the agent
   *  status hook). Shown as an in-progress bubble until the transcript catches up. */
  streamingText?: string
  hasMore?: boolean
  loadingEarlier?: boolean
  onLoadEarlier?: () => void
  onSend: (text: string) => void
  /** Optimistic queued sends (owned by the route so they survive view switches). */
  pending: Array<{ id: string; text: string }>
  /** Controlled composer text (owned by the route so dictation can write to it). */
  composerText: string
  onComposerTextChange: (text: string) => void
  onAttachImage?: () => void
  isAttaching?: boolean
  onMicPress?: () => void
  micActive?: boolean
  inputLocked?: boolean
  filePaths?: string[]
  onNeedFiles?: () => void
  /** A pending agent question/permission detected from live status, shown as a
   *  native card above the composer; answering sends text to the agent. */
  question?: MobileChatQuestion | null
  onAnswerQuestion?: (text: string) => void
  permission?: MobileChatPermission | null
  onRespondPermission?: (send: string) => void
  /** Open a worktree file tapped in agent markdown. */
  onOpenFile?: (relativePath: string) => void
  /** Pixels to lift the composer by when the soft keyboard is open. The route
   *  owns keyboard tracking (the app uses manual lift, not KeyboardAvoidingView). */
  keyboardInset?: number
}

function statusHint(status: MobileNativeChatStatus, error?: string): string | null {
  switch (status) {
    case 'waiting-session':
      return 'Waiting for the agent to start its session…'
    case 'error':
      return error ?? 'Could not load the conversation.'
    default:
      return null
  }
}

export function MobileNativeChatView({
  messages,
  status,
  error,
  agentWorking,
  onStop,
  streamingText,
  hasMore,
  loadingEarlier,
  onLoadEarlier,
  onSend,
  pending,
  composerText,
  onComposerTextChange,
  onAttachImage,
  isAttaching,
  onMicPress,
  micActive,
  inputLocked,
  filePaths,
  onNeedFiles,
  question,
  onAnswerQuestion,
  permission,
  onRespondPermission,
  onOpenFile,
  keyboardInset = 0
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList<NativeChatMessage>>(null)
  const [toolsExpanded, setToolsExpanded] = useState(false)
  // Lift the composer clear of the keyboard, plus the bottom safe-area so it
  // never sits under the home indicator / nav bar (mirrors the terminal dock).
  const bottomPad = keyboardInset > 0 ? keyboardInset + insets.bottom : insets.bottom
  const [atBottom, setAtBottom] = useState(true)
  // Pinch-to-zoom chat font. `fontScale` is the committed size; `pinchBase`
  // anchors the live gesture so successive pinches compound rather than reset.
  const [fontScale, setFontScale] = useState(1)
  const fontScaleRef = useRef(1)
  fontScaleRef.current = fontScale
  const pinchBase = useRef(1)
  // Why: run the gesture callbacks on the JS thread (not a reanimated worklet) so
  // they can touch React refs/state and clampFontScale directly — accessing those
  // from the UI-thread worklet crashes the app.
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart(() => {
          pinchBase.current = fontScaleRef.current
        })
        .onUpdate((e) => {
          setFontScale(clampFontScale(pinchBase.current * e.scale))
        }),
    []
  )

  // Fold each tool-result turn into the assistant turn it belongs to, then append
  // the route-owned optimistic "queued" messages at the tail.
  const folded = useMemo(() => foldToolMessages(messages), [messages])
  const pendingIds = useMemo(() => new Set(pending.map((p) => p.id)), [pending])
  // Only show the streaming bubble while its text leads the transcript — once the
  // real assistant turn lands with the same text, drop the synthetic one.
  const streaming = useMemo(() => {
    const text = streamingText?.trim()
    if (!text) {
      return null
    }
    const last = folded[folded.length - 1]
    const lastText =
      last?.role === 'assistant'
        ? last.blocks
            .filter((b) => b.type === 'text')
            .map((b) => (b.type === 'text' ? b.text : ''))
            .join('')
            .trim()
        : ''
    if (lastText.includes(text) || text.length <= lastText.length) {
      return null
    }
    return text
  }, [streamingText, folded])
  const data = useMemo<NativeChatMessage[]>(
    () => [
      ...folded,
      ...(streaming
        ? [
            {
              id: 'streaming',
              role: 'assistant' as const,
              blocks: [{ type: 'text' as const, text: streaming }],
              timestamp: null,
              source: 'hook' as const
            }
          ]
        : []),
      ...pending.map((p) => ({
        id: p.id,
        role: 'user' as const,
        blocks: [{ type: 'text' as const, text: p.text }],
        timestamp: null,
        source: 'transcript' as const
      }))
    ],
    [folded, streaming, pending]
  )

  // Follow the tail as the conversation grows, but only when already pinned to
  // the bottom — don't yank the user away while they read history.
  useEffect(() => {
    if (data.length === 0 || !atBottom) {
      return
    }
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
    return () => clearTimeout(t)
  }, [data.length, atBottom])

  // Keep the newest message visible above the keyboard when it opens.
  useEffect(() => {
    if (keyboardInset <= 0 || data.length === 0 || !atBottom) {
      return
    }
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(t)
  }, [keyboardInset, data.length, atBottom])

  const handleSend = useCallback(
    (text: string) => {
      onSend(text)
      // Always jump to the newest message when the user sends.
      setAtBottom(true)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60)
    },
    [onSend]
  )

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height)
      setAtBottom(distanceFromBottom < 80)
      // Near the top — page in older history.
      if (contentOffset.y < 60 && hasMore && !loadingEarlier) {
        onLoadEarlier?.()
      }
    },
    [hasMore, loadingEarlier, onLoadEarlier]
  )

  // Align a single message's top to the top of the viewport.
  const onScrollToMessage = useCallback((index: number) => {
    listRef.current?.scrollToIndex({ index, viewPosition: 0, animated: true })
  }, [])

  const renderItem = useCallback(
    ({ item, index }: { item: NativeChatMessage; index: number }) => (
      <MobileNativeChatMessage
        message={item}
        queued={pendingIds.has(item.id)}
        toolsExpanded={toolsExpanded}
        fontScale={fontScale}
        messageIndex={index}
        onScrollToMessage={onScrollToMessage}
        onOpenFile={onOpenFile}
      />
    ),
    [pendingIds, toolsExpanded, fontScale, onScrollToMessage, onOpenFile]
  )

  const hint = statusHint(status, error)
  const showLoading = status === 'loading' && messages.length === 0

  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
      {showLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : (
        <GestureHandlerRootView style={styles.listWrap}>
          <GestureDetector gesture={pinchGesture}>
            <FlatList
              ref={listRef}
              data={data}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              onScroll={onScroll}
              scrollEventThrottle={32}
              onContentSizeChange={() => {
                if (data.length > 0 && atBottom) {
                  listRef.current?.scrollToEnd({ animated: false })
                }
              }}
              // scrollToIndex can fail before an off-screen row is measured —
              // fall back to an estimated offset, then retry once it's laid out.
              onScrollToIndexFailed={(info) => {
                listRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true
                })
                setTimeout(() => {
                  listRef.current?.scrollToIndex({
                    index: info.index,
                    viewPosition: 0,
                    animated: true
                  })
                }, 120)
              }}
              ListHeaderComponent={
                hasMore ? (
                  <Pressable
                    style={styles.loadEarlier}
                    onPress={onLoadEarlier}
                    disabled={loadingEarlier}
                  >
                    {loadingEarlier ? (
                      <ActivityIndicator size="small" color={colors.textMuted} />
                    ) : (
                      <Text style={styles.loadEarlierText}>Load earlier messages</Text>
                    )}
                  </Pressable>
                ) : null
              }
              ListEmptyComponent={
                hint ? (
                  <View style={styles.center}>
                    <Text style={styles.hint}>{hint}</Text>
                  </View>
                ) : status === 'ready' ? (
                  <View style={styles.center}>
                    <Text style={styles.hint}>No messages yet.</Text>
                  </View>
                ) : null
              }
            />
          </GestureDetector>
          {/* Jump-to-latest control. The scroll-to-top affordance now lives
              per-message (the up-arrow in each agent message's controls). */}
          {!atBottom ? (
            <Pressable
              accessibilityLabel="Scroll to latest"
              style={[styles.fab, styles.fabBottom]}
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
            >
              <ArrowDown size={18} color={colors.textPrimary} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </GestureHandlerRootView>
      )}
      {/* Pending agent prompt: permission takes precedence over a question. */}
      {permission ? (
        <MobileNativeChatPermission
          permission={permission}
          onRespond={(send) => onRespondPermission?.(send)}
        />
      ) : question ? (
        <MobileNativeChatQuestion
          question={question}
          onAnswer={(text) => onAnswerQuestion?.(text)}
        />
      ) : null}
      {/* Chrome row above the composer: working status on the left, the global
          tool-calls expand/collapse toggle in the right corner. */}
      <View style={styles.chromeRow}>
        <View style={styles.chromeLeft}>
          {agentWorking ? (
            <Pressable
              style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
              onPress={onStop}
              hitSlop={8}
              accessibilityLabel="Stop the agent"
            >
              <MobileAgentWorkingIndicator />
              <Square
                size={13}
                color={colors.statusRed}
                strokeWidth={2.4}
                fill={colors.statusRed}
              />
              <Text style={styles.stopLabel}>Stop</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={({ pressed }) => [styles.chromeToggle, pressed && styles.pressed]}
          onPress={() => setToolsExpanded((v) => !v)}
          hitSlop={8}
        >
          {toolsExpanded ? (
            <ChevronsDownUp size={14} color={colors.textMuted} strokeWidth={2} />
          ) : (
            <ChevronsUpDown size={14} color={colors.textMuted} strokeWidth={2} />
          )}
          <Text style={styles.chromeToggleLabel}>{toolsExpanded ? 'Collapse' : 'Tools'}</Text>
        </Pressable>
      </View>
      <MobileNativeChatComposer
        value={composerText}
        onChangeText={onComposerTextChange}
        onSend={handleSend}
        onAttachImage={onAttachImage}
        isAttaching={isAttaching}
        onMicPress={onMicPress}
        micActive={micActive}
        disabled={inputLocked}
        placeholder={
          inputLocked ? 'Input is locked by another client' : 'Message, @files, /commands'
        }
        filePaths={filePaths}
        onNeedFiles={onNeedFiles}
      />
    </View>
  )
}
