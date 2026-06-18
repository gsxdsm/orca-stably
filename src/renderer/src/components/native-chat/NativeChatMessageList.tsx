import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  isTextBlock,
  type NativeChatBlock,
  type NativeChatMessage,
  type NativeChatSession
} from '../../../../shared/native-chat-types'
import { orderNativeChatMessages } from './native-chat-message-grouping'
import { foldToolMessages, splitNativeChatBlocks } from './native-chat-tool-fold'
import { isNearBottom, shouldShowJumpToLatest, type ScrollGeometry } from './native-chat-autoscroll'
import { NativeChatToolRun } from './NativeChatToolRun'
import { NativeChatWorkingIndicator } from './NativeChatWorkingIndicator'

function geometryOf(el: HTMLElement): ScrollGeometry {
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
}

function proseToMarkdown(blocks: NativeChatBlock[]): string {
  return blocks
    .map((block) => {
      if (isTextBlock(block)) {
        return block.text
      }
      // image-ref blocks: surface a compact reference rather than embedding the
      // raw path as prose. Input-image rendering is out of scope (plan U8/defer).
      if (block.type === 'image-ref') {
        const label = block.alt || block.path || block.url || 'image'
        return `\`[image: ${label}]\``
      }
      return ''
    })
    .filter((part) => part.length > 0)
    .join('\n\n')
}

/** One message: its prose first, then a collapsible run folding all of the
 *  turn's tool activity. Monochrome per STYLEGUIDE: user prompts read as a
 *  lifted card, assistant prose as body copy, reasoning de-emphasized. */
function MessageRow({
  message,
  expandSignal
}: {
  message: NativeChatMessage
  expandSignal: boolean
}): React.JSX.Element {
  const { prose, tools } = useMemo(() => splitNativeChatBlocks(message.blocks), [message.blocks])
  const markdown = proseToMarkdown(prose)
  const isUser = message.role === 'user'
  const isReasoning = message.role === 'reasoning'
  const isSystem = message.role === 'system'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-tr-sm border border-border bg-card px-3 py-2 text-sm text-card-foreground">
          {markdown ? (
            <CommentMarkdown content={markdown} variant="document" className="text-sm" />
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'max-w-full text-sm leading-relaxed text-foreground',
        // Reasoning is the agent thinking aloud — quieter, italic, like an aside.
        isReasoning && 'border-l-2 border-border/60 pl-3 italic text-muted-foreground',
        isSystem && 'text-xs text-muted-foreground'
      )}
    >
      {markdown ? (
        <CommentMarkdown content={markdown} variant="document" className="text-sm" />
      ) : null}
      {tools.length > 0 ? <NativeChatToolRun blocks={tools} expandSignal={expandSignal} /> : null}
    </div>
  )
}

export function NativeChatMessageList({
  session,
  isWorking,
  expandSignal
}: {
  session: NativeChatSession
  isWorking: boolean
  /** Toolbar-driven desired open state for every tool run; each flip re-syncs. */
  expandSignal: boolean
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [stuckToBottom, setStuckToBottom] = useState(true)
  const [showJump, setShowJump] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  // Why: mirror stuck state into a ref so the auto-scroll layout effect can read
  // it without depending on it — depending on stuckToBottom (which scrollToBottom
  // sets) would re-fire the effect in a self-loop.
  const stuckToBottomRef = useRef(stuckToBottom)
  stuckToBottomRef.current = stuckToBottom

  // Fold each turn's tool activity into the assistant message it belongs to, then
  // order stably, so a whole turn's tools collapse under one run.
  const messages = useMemo(
    () => foldToolMessages(orderNativeChatMessages(session.messages)),
    [session.messages]
  )

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const geometry = geometryOf(el)
    const stick = isNearBottom(geometry)
    setStuckToBottom(stick)
    setShowJump(shouldShowJumpToLatest(stick, geometry))
    // Offer "scroll to top" once the user has scrolled down past a screenful.
    setShowScrollTop(geometry.scrollTop > geometry.clientHeight)
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    el.scrollTop = el.scrollHeight
    setStuckToBottom(true)
    setShowJump(false)
  }, [])

  const scrollToTop = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    el.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Re-pin to the bottom when new content arrives, but only if the user hasn't
  // scrolled up. Layout effect so the jump happens before paint (no flicker).
  useLayoutEffect(() => {
    if (stuckToBottomRef.current) {
      scrollToBottom()
    }
  }, [messages.length, isWorking, scrollToBottom])

  // Keep the affordances in sync if the container resizes (e.g. composer mounts,
  // viewport reflow) without a scroll event.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(handleScroll)
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleScroll])

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-sleek h-full overflow-y-auto px-3 py-4 sm:px-4"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} expandSignal={expandSignal} />
          ))}
          {isWorking ? <NativeChatWorkingIndicator /> : null}
        </div>
      </div>
      {showScrollTop ? (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label={translate('components.native-chat.scrollToTop', 'Scroll to top')}
          className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-sm backdrop-blur hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowUp className="size-4" />
        </button>
      ) : null}
      {showJump ? (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label={translate('components.native-chat.jumpToLatest', 'Jump to latest')}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown className="size-3.5" />
          <span>{translate('components.native-chat.jumpToLatest', 'Jump to latest')}</span>
        </button>
      ) : null}
    </div>
  )
}
