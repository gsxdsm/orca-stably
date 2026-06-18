import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowDown, ArrowUp, ChevronsDownUp, ChevronsUpDown } from 'lucide-react-native'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { foldToolMessages } from './mobile-native-chat-blocks'
import { MobileAgentWorkingIndicator } from './MobileAgentWorkingIndicator'
import { MobileNativeChatComposer } from './MobileNativeChatComposer'
import { MobileNativeChatMessage } from './MobileNativeChatMessage'
import type { MobileNativeChatStatus } from './use-mobile-native-chat-session'

type Props = {
  messages: NativeChatMessage[]
  status: MobileNativeChatStatus
  error?: string
  agentWorking?: boolean
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
  keyboardInset = 0
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList<NativeChatMessage>>(null)
  const [toolsExpanded, setToolsExpanded] = useState(false)
  // Lift the composer clear of the keyboard, plus the bottom safe-area so it
  // never sits under the home indicator / nav bar (mirrors the terminal dock).
  const bottomPad = keyboardInset > 0 ? keyboardInset + insets.bottom : insets.bottom
  const [atBottom, setAtBottom] = useState(true)
  const [scrolled, setScrolled] = useState(false)

  // Fold each tool-result turn into the assistant turn it belongs to, then append
  // the route-owned optimistic "queued" messages at the tail.
  const folded = useMemo(() => foldToolMessages(messages), [messages])
  const pendingIds = useMemo(() => new Set(pending.map((p) => p.id)), [pending])
  const data = useMemo<NativeChatMessage[]>(
    () => [
      ...folded,
      ...pending.map((p) => ({
        id: p.id,
        role: 'user' as const,
        blocks: [{ type: 'text' as const, text: p.text }],
        timestamp: null,
        source: 'transcript' as const
      }))
    ],
    [folded, pending]
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
      setScrolled(contentOffset.y > 80)
      // Near the top — page in older history.
      if (contentOffset.y < 60 && hasMore && !loadingEarlier) {
        onLoadEarlier?.()
      }
    },
    [hasMore, loadingEarlier, onLoadEarlier]
  )

  const renderItem = useCallback(
    ({ item }: { item: NativeChatMessage }) => (
      <MobileNativeChatMessage
        message={item}
        queued={pendingIds.has(item.id)}
        toolsExpanded={toolsExpanded}
      />
    ),
    [pendingIds, toolsExpanded]
  )

  const hint = statusHint(status, error)
  const showLoading = status === 'loading' && messages.length === 0

  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
      <View style={styles.toolbar}>
        <Pressable
          style={({ pressed }) => [styles.toolbarButton, pressed && styles.pressed]}
          onPress={() => setToolsExpanded((v) => !v)}
          hitSlop={6}
        >
          {toolsExpanded ? (
            <ChevronsDownUp size={15} color={colors.textSecondary} strokeWidth={2} />
          ) : (
            <ChevronsUpDown size={15} color={colors.textSecondary} strokeWidth={2} />
          )}
          <Text style={styles.toolbarLabel}>
            {toolsExpanded ? 'Collapse tool calls' : 'Expand tool calls'}
          </Text>
        </Pressable>
      </View>
      {showLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : (
        <View style={styles.listWrap}>
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
          {/* Jump controls: to top of conversation / to latest message. */}
          {scrolled ? (
            <Pressable
              accessibilityLabel="Scroll to top"
              style={[styles.fab, styles.fabTop]}
              onPress={() => {
                if (hasMore) {
                  onLoadEarlier?.()
                }
                listRef.current?.scrollToOffset({ offset: 0, animated: true })
              }}
            >
              <ArrowUp size={18} color={colors.textPrimary} strokeWidth={2.2} />
            </Pressable>
          ) : null}
          {!atBottom ? (
            <Pressable
              accessibilityLabel="Scroll to latest"
              style={[styles.fab, styles.fabBottom]}
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
            >
              <ArrowDown size={18} color={colors.textPrimary} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
      )}
      {agentWorking ? <MobileAgentWorkingIndicator /> : null}
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgBase
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4
  },
  toolbarLabel: {
    color: colors.textSecondary,
    fontSize: typography.metaSize,
    fontWeight: '600'
  },
  pressed: {
    opacity: 0.6
  },
  listWrap: {
    flex: 1,
    position: 'relative'
  },
  listContent: {
    paddingVertical: spacing.sm,
    flexGrow: 1
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl
  },
  hint: {
    color: colors.textMuted,
    fontSize: typography.bodySize,
    textAlign: 'center'
  },
  fab: {
    position: 'absolute',
    right: spacing.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle
  },
  fabTop: {
    top: spacing.md
  },
  fabBottom: {
    bottom: spacing.md
  },
  loadEarlier: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    minHeight: 36
  },
  loadEarlierText: {
    color: colors.textMuted,
    fontSize: typography.metaSize,
    fontWeight: '600'
  }
})
