import { memo, useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { ArrowUp, ChevronDown, Copy, SquareChevronRight } from 'lucide-react-native'
import type { NativeChatBlock, NativeChatMessage } from '../../../src/shared/native-chat-types'
import { MobileMarkdown } from '../components/MobileMarkdown'
import { colors } from '../theme/mobile-theme'
import {
  isImageRefBlock,
  isTextBlock,
  isToolCallBlock,
  isToolResultBlock,
  splitNativeChatBlocks
} from './mobile-native-chat-blocks'
import { diffFromText, diffFromToolCall, type DiffLine } from './mobile-native-chat-diff'
import { MAX_TOOL_RESULT_CHARS, styles, TEXT_SIZE } from './mobile-native-chat-message-styles'
import { nativeChatMessageText } from './mobile-native-chat-message-text'
import { summarizeToolInput, summarizeToolRun } from './mobile-native-chat-tool-summary'

function DiffView({ lines }: { lines: DiffLine[] }): React.JSX.Element {
  return (
    <View style={styles.diff}>
      {lines.map((line, i) => (
        <Text
          key={i}
          style={[
            styles.diffLine,
            line.kind === 'add' && styles.diffAdd,
            line.kind === 'del' && styles.diffDel,
            line.kind === 'meta' && styles.diffMeta
          ]}
        >
          {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
          {line.text}
        </Text>
      ))}
    </View>
  )
}

/** A single inline tool line — `▸ ToolName  preview` — that expands in place to
 *  show the call's diff/input or the result's body. Mirrors the reference design
 *  where tool calls read as flat lines in the conversation, not boxed blocks. */
function ToolLine({ block }: { block: NativeChatBlock }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  let name: string
  let preview: string
  let diff: DiffLine[] | null = null
  let body: { output: string; isError?: boolean } | null = null

  if (isToolCallBlock(block)) {
    name = block.name
    preview = summarizeToolInput(block.input)
    diff = diffFromToolCall(block.name, block.input)
  } else if (isToolResultBlock(block)) {
    name = 'Result'
    preview = block.output.split('\n')[0]?.slice(0, 80) ?? ''
    diff = diffFromText(block.output)
    body = { output: block.output, isError: block.isError }
  } else {
    return null
  }

  const hasDetail = diff !== null || body !== null || preview.length > 40
  return (
    <View>
      <Pressable
        style={styles.toolLine}
        onPress={() => hasDetail && setExpanded((v) => !v)}
        hitSlop={6}
      >
        {expanded ? (
          <ChevronDown size={15} color={colors.textMuted} strokeWidth={2} />
        ) : (
          <SquareChevronRight size={15} color={colors.textMuted} strokeWidth={2} />
        )}
        <Text style={styles.toolName}>{name}</Text>
        {preview ? (
          <Text style={styles.toolPreview} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}
      </Pressable>
      {expanded ? (
        <View style={styles.toolDetail}>
          {diff ? <DiffView lines={diff} /> : null}
          {!diff && body ? (
            <View style={[styles.toolResult, body.isError && styles.toolResultError]}>
              <Text style={styles.mono}>
                {body.output.length > MAX_TOOL_RESULT_CHARS
                  ? `${body.output.slice(0, MAX_TOOL_RESULT_CHARS)}…`
                  : body.output}
              </Text>
            </View>
          ) : null}
          {!diff && !body && preview ? <Text style={styles.mono}>{preview}</Text> : null}
        </View>
      ) : null}
    </View>
  )
}

function Prose({
  block,
  invert,
  fontScale,
  onOpenFile
}: {
  block: NativeChatBlock
  invert?: boolean
  fontScale: number
  onOpenFile?: (relativePath: string) => void
}): React.JSX.Element | null {
  if (isTextBlock(block)) {
    // Inverted (user) bubbles use a fixed dark-on-light text rather than the
    // markdown renderer's light-on-dark palette.
    if (invert) {
      return (
        <Text style={[styles.userText, { fontSize: TEXT_SIZE * fontScale }]}>{block.text}</Text>
      )
    }
    return (
      <MobileMarkdown content={block.text} textScale={1.25 * fontScale} onOpenFile={onOpenFile} />
    )
  }
  if (isImageRefBlock(block)) {
    return (
      <Text style={[styles.imageRef, { fontSize: TEXT_SIZE * fontScale }]}>
        🖼 {block.alt ?? block.path ?? block.url ?? 'image'}
      </Text>
    )
  }
  return null
}

/** A run of a message's tool calls/results, collapsed to a one-line summary that
 *  expands to the individual inline tool lines. `defaultExpanded` lets the global
 *  toolbar toggle drive every run at once while still allowing per-run override. */
function ToolRun({
  blocks,
  defaultExpanded
}: {
  blocks: NativeChatBlock[]
  defaultExpanded: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultExpanded)
  // Re-sync when the global toolbar toggle flips.
  useEffect(() => setOpen(defaultExpanded), [defaultExpanded])
  const callCount = blocks.filter((b) => b.type === 'tool-call').length || blocks.length
  const summary = summarizeToolRun(blocks)
  return (
    <View style={styles.toolRun}>
      <Pressable style={styles.toolLine} onPress={() => setOpen((v) => !v)} hitSlop={6}>
        {open ? (
          <ChevronDown size={15} color={colors.textMuted} strokeWidth={2} />
        ) : (
          <SquareChevronRight size={15} color={colors.textMuted} strokeWidth={2} />
        )}
        <Text style={styles.toolRunCount}>{callCount}×</Text>
        <Text style={styles.toolRunLabel} numberOfLines={1}>
          {summary || `${callCount} tool ${callCount === 1 ? 'call' : 'calls'}`}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.toolRunBody}>
          {blocks.map((block, i) => (
            <ToolLine key={i} block={block} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

/** Subtle top-right controls for an agent message: copy its prose, or scroll so
 *  this message's top aligns to the top of the viewport. */
function AgentControls({
  onCopy,
  onScrollToTop
}: {
  onCopy: () => void
  onScrollToTop?: () => void
}): React.JSX.Element {
  return (
    <View style={styles.controls}>
      <Pressable
        style={({ pressed }) => [styles.controlButton, pressed && styles.controlPressed]}
        onPress={onCopy}
        hitSlop={8}
        accessibilityLabel="Copy message"
      >
        <Copy size={14} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
      {onScrollToTop ? (
        <Pressable
          style={({ pressed }) => [styles.controlButton, pressed && styles.controlPressed]}
          onPress={onScrollToTop}
          hitSlop={8}
          accessibilityLabel="Scroll this message to top"
        >
          <ArrowUp size={14} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  )
}

function MobileNativeChatMessageImpl({
  message,
  queued,
  toolsExpanded = false,
  fontScale = 1,
  messageIndex,
  onScrollToMessage,
  onOpenFile
}: {
  message: NativeChatMessage
  queued?: boolean
  toolsExpanded?: boolean
  /** Multiplies all chat text sizes for pinch-to-zoom (1 = no change). */
  fontScale?: number
  /** This message's index in the list, paired with onScrollToMessage. */
  messageIndex?: number
  /** Ask the list to align this message's top to the top of the viewport. */
  onScrollToMessage?: (index: number) => void
  onOpenFile?: (relativePath: string) => void
}): React.JSX.Element {
  const isUser = message.role === 'user'
  const isReasoning = message.role === 'reasoning'
  const isAgent = !isUser
  // Briefly tint the bubble to confirm a copy landed.
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (copyTimer.current) {
        clearTimeout(copyTimer.current)
      }
    },
    []
  )
  // Separate the agent's words from its tool activity: prose renders first, the
  // tool calls fold into a collapsible run beneath. The user's own messages get
  // an inverted (filled accent) bubble so they stand apart from agent prose.
  const { prose, tools } = splitNativeChatBlocks(message.blocks)

  const handleCopy = (): void => {
    const text = nativeChatMessageText(message.blocks)
    if (!text) {
      return
    }
    void Clipboard.setStringAsync(text)
    setCopied(true)
    if (copyTimer.current) {
      clearTimeout(copyTimer.current)
    }
    copyTimer.current = setTimeout(() => setCopied(false), 700)
  }

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {isUser && queued ? <Text style={styles.queuedTag}>Queued</Text> : null}
      {isAgent && !queued ? (
        <AgentControls
          onCopy={handleCopy}
          onScrollToTop={
            onScrollToMessage && messageIndex !== undefined
              ? () => onScrollToMessage(messageIndex)
              : undefined
          }
        />
      ) : null}
      <View
        style={[
          styles.content,
          isUser && styles.userBubble,
          isReasoning && styles.reasoning,
          queued && styles.queued,
          copied && styles.copied
        ]}
      >
        {prose.map((block, index) => (
          <Prose
            key={index}
            block={block}
            invert={isUser}
            fontScale={fontScale}
            onOpenFile={onOpenFile}
          />
        ))}
        {tools.length > 0 ? <ToolRun blocks={tools} defaultExpanded={toolsExpanded} /> : null}
      </View>
    </View>
  )
}

export const MobileNativeChatMessage = memo(MobileNativeChatMessageImpl)
