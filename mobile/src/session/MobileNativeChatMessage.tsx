import { memo, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronDown, SquareChevronRight } from 'lucide-react-native'
import type { NativeChatBlock, NativeChatMessage } from '../../../src/shared/native-chat-types'
import { MobileMarkdown } from '../components/MobileMarkdown'
import { colors, radii, spacing } from '../theme/mobile-theme'
import {
  isImageRefBlock,
  isTextBlock,
  isToolCallBlock,
  isToolResultBlock,
  splitNativeChatBlocks
} from './mobile-native-chat-blocks'
import { diffFromText, diffFromToolCall, type DiffLine } from './mobile-native-chat-diff'
import { summarizeToolInput, summarizeToolRun } from './mobile-native-chat-tool-summary'

const TEXT_SIZE = 17
const MONO_SIZE = 12
const MAX_TOOL_RESULT_CHARS = 4000

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
  invert
}: {
  block: NativeChatBlock
  invert?: boolean
}): React.JSX.Element | null {
  if (isTextBlock(block)) {
    // Inverted (user) bubbles use a fixed dark-on-light text rather than the
    // markdown renderer's light-on-dark palette.
    if (invert) {
      return <Text style={styles.userText}>{block.text}</Text>
    }
    return <MobileMarkdown content={block.text} textScale={1.25} />
  }
  if (isImageRefBlock(block)) {
    return <Text style={styles.imageRef}>🖼 {block.alt ?? block.path ?? block.url ?? 'image'}</Text>
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

function MobileNativeChatMessageImpl({
  message,
  queued,
  toolsExpanded = false
}: {
  message: NativeChatMessage
  queued?: boolean
  toolsExpanded?: boolean
}): React.JSX.Element {
  const isUser = message.role === 'user'
  const isReasoning = message.role === 'reasoning'
  // Separate the agent's words from its tool activity: prose renders first, the
  // tool calls fold into a collapsible run beneath. The user's own messages get
  // an inverted (filled accent) bubble so they stand apart from agent prose.
  const { prose, tools } = splitNativeChatBlocks(message.blocks)
  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {isUser && queued ? <Text style={styles.queuedTag}>Queued</Text> : null}
      <View
        style={[
          styles.content,
          isUser && styles.userBubble,
          isReasoning && styles.reasoning,
          queued && styles.queued
        ]}
      >
        {prose.map((block, index) => (
          <Prose key={index} block={block} invert={isUser} />
        ))}
        {tools.length > 0 ? <ToolRun blocks={tools} defaultExpanded={toolsExpanded} /> : null}
      </View>
    </View>
  )
}

export const MobileNativeChatMessage = memo(MobileNativeChatMessageImpl)

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  rowUser: {
    alignItems: 'flex-end'
  },
  content: {
    maxWidth: '100%',
    gap: spacing.sm
  },
  userBubble: {
    maxWidth: '88%',
    backgroundColor: colors.textPrimary,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  userText: {
    color: colors.bgBase,
    fontSize: TEXT_SIZE,
    lineHeight: TEXT_SIZE + 6,
    fontWeight: '500'
  },
  reasoning: {
    opacity: 0.7
  },
  queued: {
    opacity: 0.55
  },
  queuedTag: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2
  },
  toolRun: {
    marginTop: spacing.xs
  },
  toolRunCount: {
    color: colors.syntaxMeta,
    fontFamily: 'monospace',
    fontSize: MONO_SIZE,
    fontWeight: '700'
  },
  toolRunLabel: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: MONO_SIZE
  },
  toolRunBody: {
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderSubtle,
    marginTop: spacing.xs
  },
  toolLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 3
  },
  toolName: {
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: MONO_SIZE + 1,
    fontWeight: '600'
  },
  toolPreview: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: MONO_SIZE
  },
  toolDetail: {
    paddingLeft: spacing.lg,
    paddingBottom: spacing.xs,
    gap: spacing.xs
  },
  mono: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: MONO_SIZE,
    lineHeight: MONO_SIZE + 5
  },
  toolResult: {
    borderRadius: radii.button,
    backgroundColor: colors.bgPanel,
    padding: spacing.md
  },
  toolResultError: {
    backgroundColor: colors.diffDeletedBg
  },
  imageRef: {
    color: colors.textSecondary,
    fontSize: TEXT_SIZE
  },
  diff: {
    borderRadius: radii.button,
    backgroundColor: colors.bgPanel,
    paddingVertical: spacing.xs,
    overflow: 'hidden'
  },
  diffLine: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: MONO_SIZE,
    lineHeight: MONO_SIZE + 5,
    paddingHorizontal: spacing.sm
  },
  diffAdd: {
    color: colors.gitDecorationAdded,
    backgroundColor: colors.diffAddedBg
  },
  diffDel: {
    color: colors.gitDecorationDeleted,
    backgroundColor: colors.diffDeletedBg
  },
  diffMeta: {
    color: colors.textMuted
  }
})
