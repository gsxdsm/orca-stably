import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ChevronRight, Loader2, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import {
  isTextBlock,
  type NativeChatBlock,
  type NativeChatMessage,
  type NativeChatSession
} from '../../../../shared/native-chat-types'
import {
  buildNativeChatRenderItems,
  type NativeChatRenderItem,
  type NativeChatToolStep
} from './native-chat-message-grouping'
import { isNearBottom, shouldShowJumpToLatest, type ScrollGeometry } from './native-chat-autoscroll'

function geometryOf(el: HTMLElement): ScrollGeometry {
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
}

function blocksToMarkdown(blocks: NativeChatBlock[]): string {
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

/** Visual role treatment. Monochrome per STYLEGUIDE: user prompts read as a
 *  lifted card, assistant prose as body copy, reasoning de-emphasized, system
 *  muted. No invented colors. */
function MessageRow({
  message,
  blocks
}: {
  message: NativeChatMessage
  blocks: NativeChatBlock[]
}): React.JSX.Element {
  const markdown = blocksToMarkdown(blocks)
  const isUser = message.role === 'user'
  const isReasoning = message.role === 'reasoning'
  const isSystem = message.role === 'system'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-tr-sm border border-border bg-card px-3 py-2 text-sm text-card-foreground">
          <CommentMarkdown content={markdown} variant="document" className="text-sm" />
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
      <CommentMarkdown content={markdown} variant="document" className="text-sm" />
    </div>
  )
}

/** Collapsible tool step: a call header plus the (optional) result, modeled on
 *  DashboardAgentRowToolStep but expandable here since there's room. */
function ToolStepRow({ step }: { step: NativeChatToolStep }): React.JSX.Element {
  const inputPreview = formatToolInput(step.call.input)
  return (
    <details className="group rounded-md border border-border bg-card/60 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        <Wrench className="size-3 shrink-0" />
        <code className="shrink-0 font-mono text-xs text-foreground/80">{step.call.name}</code>
        {inputPreview ? (
          <span className="min-w-0 truncate text-muted-foreground/70" title={inputPreview}>
            {inputPreview}
          </span>
        ) : null}
        {step.result === null ? (
          <Loader2 className="ml-auto size-3 shrink-0 animate-spin" aria-hidden />
        ) : null}
      </summary>
      <div className="space-y-2 border-t border-border/60 px-2.5 py-2">
        {inputPreview ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-accent p-2 font-mono text-[11px] text-foreground/80 scrollbar-sleek">
            {inputPreview}
          </pre>
        ) : null}
        {step.result ? (
          <pre
            className={cn(
              'max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-accent p-2 font-mono text-[11px] scrollbar-sleek',
              step.result.isError ? 'text-destructive' : 'text-foreground/80'
            )}
          >
            {step.result.output}
          </pre>
        ) : (
          <p className="text-[11px] italic text-muted-foreground/70">
            {translate('components.native-chat.tool.running', 'Running…')}
          </p>
        )}
      </div>
    </details>
  )
}

function formatToolInput(input: unknown): string {
  if (input === null || input === undefined) {
    return ''
  }
  if (typeof input === 'string') {
    return input
  }
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

function RenderItem({ item }: { item: NativeChatRenderItem }): React.JSX.Element {
  if (item.kind === 'tool-step') {
    return <ToolStepRow step={item.step} />
  }
  return <MessageRow message={item.message} blocks={item.blocks} />
}

/** The live in-flight indicator shown while the agent works and the assistant
 *  reply has not yet flushed to the transcript. */
function WorkingIndicator(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      <span>{translate('components.native-chat.status.working', 'Agent is working…')}</span>
    </div>
  )
}

export function NativeChatMessageList({
  session,
  isWorking
}: {
  session: NativeChatSession
  isWorking: boolean
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [stuckToBottom, setStuckToBottom] = useState(true)
  const [showJump, setShowJump] = useState(false)

  // Why: mirror stuck state into a ref so the auto-scroll layout effect can read
  // it without depending on it — depending on stuckToBottom (which scrollToBottom
  // sets) would re-fire the effect in a self-loop.
  const stuckToBottomRef = useRef(stuckToBottom)
  stuckToBottomRef.current = stuckToBottom

  const items = buildNativeChatRenderItems(session.messages)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const geometry = geometryOf(el)
    const stick = isNearBottom(geometry)
    setStuckToBottom(stick)
    setShowJump(shouldShowJumpToLatest(stick, geometry))
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

  // Re-pin to the bottom when new content arrives, but only if the user hasn't
  // scrolled up. Layout effect so the jump happens before paint (no flicker).
  useLayoutEffect(() => {
    if (stuckToBottomRef.current) {
      scrollToBottom()
    }
    // items length + working flag capture "new content arrived". Stuck state is
    // read from a ref so setting it inside scrollToBottom doesn't re-fire this.
  }, [items.length, isWorking])

  // Keep the jump affordance in sync if the container resizes (e.g. composer
  // mounts, viewport reflow) without a scroll event.
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
          {items.map((item) => (
            <RenderItem key={item.id} item={item} />
          ))}
          {isWorking ? <WorkingIndicator /> : null}
        </div>
      </div>
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
