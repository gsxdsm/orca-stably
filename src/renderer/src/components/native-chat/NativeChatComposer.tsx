import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowUp, ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'
import type { AgentType } from '../../../../shared/agent-status-types'
import { isRemoteRuntimePtyId, sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'
import { getSettingsForAgentTabRuntimeOwner } from '@/lib/agent-paste-draft'
import { sendNativeChatMessage } from './native-chat-runtime-send'
import { getAgentSlashCommands } from './native-chat-agent-commands'
import { emitNativeChatMessageSent } from '@/lib/native-chat-telemetry'
import {
  applyMentionSuggestion,
  applySlashSuggestion,
  deriveComposerAutocomplete,
  EMPTY_HISTORY,
  pushHistory,
  recallNext,
  recallPrevious,
  type HistoryState,
  type SlashCommandSuggestion
} from './native-chat-composer-state'
import { resolveImagePaste } from './native-chat-image-paste'

// Why: a plain ESC byte is what the agent TUIs read as the interrupt key over a
// PTY (matching how xterm forwards Escape). The richer interrupt-intent
// inference (agent-interrupt-intent.ts) is driven by the existing PTY input
// observers, so writing ESC through the same send path feeds that machinery.
const ESC = '\x1b'

export type NativeChatComposerProps = {
  /** Tab hosting the agent; used to resolve the live ptyId + runtime settings. */
  terminalTabId: string
  agent: AgentType
  /**
   * Mobile presence-lock seam (R8): when a mobile client holds the pty, desktop
   * sends must be guarded rather than silently dropped. U9 wires the real lock
   * state in; until then this defaults to `true` (sendable) and the composer
   * already renders the guarded/disabled affordance when it is `false`.
   */
  canSend?: boolean
  /** Optional optimistic-send hook: called with the sent text so the view can
   *  render a "queued" echo until the real transcript turn lands (mobile parity). */
  onOptimisticSend?: (text: string) => void
}

type ResolvedTarget = {
  ptyId: string
  settings: ReturnType<typeof getSettingsForAgentTabRuntimeOwner>
}

/**
 * Rich native input for the chat view. Sends prompts into the running agent
 * through the same verified runtime path as typed input (KTD4), so the agent
 * cannot distinguish native input from keystrokes. Enter sends; Shift+Enter
 * inserts a newline; multi-line is bracketed-paste wrapped; Esc interrupts.
 * Slash-command and `@file` autocomplete are agent-aware; image paste persists a
 * temp file and injects the agent-appropriate path (or reports unsupported).
 */
export function NativeChatComposer({
  terminalTabId,
  agent,
  canSend = true,
  onOptimisticSend
}: NativeChatComposerProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [caret, setCaret] = useState(0)
  const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const agentCommands = useMemo(() => getAgentSlashCommands(agent), [agent])
  const autocomplete = useMemo(
    () => deriveComposerAutocomplete(draft, caret, agentCommands),
    [draft, caret, agentCommands]
  )

  // Resolve the live ptyId for this tab the same way agent-paste-draft does:
  // ptyIdsByTabId carries the pane's primary pty, and the runtime owner settings
  // route local vs remote (SSH) sends.
  const resolveTarget = useCallback((): ResolvedTarget | null => {
    const ptyId = useAppStore.getState().ptyIdsByTabId[terminalTabId]?.[0]
    if (!ptyId) {
      return null
    }
    return { ptyId, settings: getSettingsForAgentTabRuntimeOwner(terminalTabId) }
  }, [terminalTabId])

  const hasPty = Boolean(useAppStore((s) => s.ptyIdsByTabId[terminalTabId]?.[0]))
  const disabled = !hasPty || !canSend

  const syncCaret = useCallback((el: HTMLTextAreaElement) => {
    setCaret(el.selectionStart ?? el.value.length)
  }, [])

  const send = useCallback(() => {
    const text = draft
    if (text.trim() === '' || disabled) {
      return
    }
    const target = resolveTarget()
    if (!target) {
      return
    }
    // Two-write send (body, then a delayed Enter) so the agent TUI submits the
    // message instead of leaving it in its input box (R6: works for SSH panes).
    sendNativeChatMessage(target.settings, target.ptyId, text)
    // Optimistic "queued" echo (mobile parity): show the prompt immediately,
    // pruned once its real user turn lands in the transcript.
    onOptimisticSend?.(text)
    // Why: U10 telemetry — record adoption + local-vs-remote runtime split. The
    // agent prop is the loose AgentType; the emitter narrows unknowns to 'other'.
    emitNativeChatMessageSent({
      agent,
      runtime: composerTargetIsRemote(target.ptyId) ? 'remote' : 'local'
    })
    setHistory((prev) => pushHistory(prev, text))
    setDraft('')
    setCaret(0)
    setNotice(null)
  }, [agent, draft, disabled, resolveTarget, onOptimisticSend])

  const interrupt = useCallback(() => {
    const target = resolveTarget()
    if (!target) {
      return
    }
    sendRuntimePtyInput(target.settings, target.ptyId, ESC)
  }, [resolveTarget])

  const chooseSlash = useCallback((command: SlashCommandSuggestion) => {
    const next = applySlashSuggestion(command)
    setDraft(next)
    setCaret(next.length)
    setActiveSuggestion(0)
    textareaRef.current?.focus()
  }, [])

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const hasImage = Array.from(event.clipboardData.items).some((item) =>
        item.type.startsWith('image/')
      )
      if (!hasImage) {
        return
      }
      event.preventDefault()
      // Why: snapshot the caret before the async temp-file round-trip — `caret`
      // state can move (further typing/selection) while the await is in flight.
      const caretAtPaste = caret
      void (async () => {
        const tempPath = await window.api.ui.saveClipboardImageAsTempFile()
        if (!tempPath) {
          return
        }
        const result = resolveImagePaste(agent, tempPath)
        if (result.kind === 'unsupported') {
          setNotice(
            translate(
              'components.native-chat.composer.imageUnsupported',
              'Image paste is not supported for this agent.'
            )
          )
          return
        }
        // Insert the path at the caret as plain draft text; the agent resolves
        // the file path to an attachment.
        setDraft((prev) => {
          const before = prev.slice(0, caretAtPaste)
          const after = prev.slice(caretAtPaste)
          const insertion = `${result.reference} `
          const next = before + insertion + after
          setCaret(before.length + insertion.length)
          return next
        })
        setNotice(null)
      })()
    },
    [agent, caret]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Autocomplete navigation takes priority over send while a menu is open.
      if (autocomplete.mode === 'slash' && autocomplete.suggestions.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setActiveSuggestion((i) => (i + 1) % autocomplete.suggestions.length)
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActiveSuggestion(
            (i) => (i - 1 + autocomplete.suggestions.length) % autocomplete.suggestions.length
          )
          return
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault()
          chooseSlash(autocomplete.suggestions[activeSuggestion] ?? autocomplete.suggestions[0])
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setDraft('')
          setCaret(0)
          return
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        interrupt()
        return
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        send()
        return
      }

      // History recall only on an empty draft (or while already recalling), so
      // arrow keys still move the caret inside real multi-line text.
      if (event.key === 'ArrowUp' && (draft === '' || history.index !== null)) {
        const recall = recallPrevious(history)
        if (recall.draft !== null) {
          event.preventDefault()
          setHistory(recall.history)
          setDraft(recall.draft)
          setCaret(recall.draft.length)
        }
        return
      }
      if (event.key === 'ArrowDown' && history.index !== null) {
        const recall = recallNext(history)
        if (recall.draft !== null) {
          event.preventDefault()
          setHistory(recall.history)
          setDraft(recall.draft)
          setCaret(recall.draft.length)
        }
      }
    },
    [autocomplete, activeSuggestion, chooseSlash, interrupt, send, draft, history]
  )

  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="relative mx-auto w-full max-w-3xl px-3 py-2 sm:px-4">
        {autocomplete.mode === 'slash' && autocomplete.suggestions.length > 0 ? (
          <SlashMenu
            suggestions={autocomplete.suggestions}
            activeIndex={activeSuggestion}
            onChoose={chooseSlash}
          />
        ) : null}
        {autocomplete.mode === 'mention' ? (
          <MentionHint
            query={autocomplete.query}
            onAccept={() => {
              const result = applyMentionSuggestion(draft, caret, autocomplete.query)
              setDraft(result.draft)
              setCaret(result.caret)
              textareaRef.current?.focus()
            }}
          />
        ) : null}
        {notice ? (
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ImageOff className="size-3.5 shrink-0" />
            <span>{notice}</span>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            disabled={disabled}
            rows={1}
            onChange={(e) => {
              setDraft(e.target.value)
              setHistory((prev) => ({ entries: prev.entries, index: null }))
              syncCaret(e.target)
              setActiveSuggestion(0)
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onSelect={(e) => syncCaret(e.currentTarget)}
            placeholder={composerPlaceholder(hasPty, canSend)}
            // Why: coarse-pointer (touch) min-height meets the 44px tap-target
            // convention used elsewhere (size-11) so the composer is usable with
            // the on-screen keyboard on the mobile driver (U9/R8).
            className={cn(
              'min-h-9 max-h-40 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none pointer-coarse:min-h-11',
              'placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'
            )}
          />
          <button
            type="button"
            aria-label={translate('components.native-chat.composer.send', 'Send')}
            disabled={disabled || draft.trim() === ''}
            onClick={send}
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors pointer-coarse:size-11',
              'hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50'
            )}
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function composerPlaceholder(hasPty: boolean, canSend: boolean): string {
  if (!hasPty) {
    return translate(
      'components.native-chat.composer.noPty',
      'No live terminal — toggle back to reconnect.'
    )
  }
  if (!canSend) {
    return translate('components.native-chat.composer.locked', 'Input is held by another device.')
  }
  return translate('components.native-chat.composer.placeholder', 'Send a message…')
}

function SlashMenu({
  suggestions,
  activeIndex,
  onChoose
}: {
  suggestions: SlashCommandSuggestion[]
  activeIndex: number
  onChoose: (command: SlashCommandSuggestion) => void
}): React.JSX.Element {
  return (
    <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-md border border-border bg-popover shadow-md sm:left-4 sm:right-4">
      {suggestions.map((command, index) => (
        <button
          key={command.name}
          type="button"
          onClick={() => onChoose(command)}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
            index === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground'
          )}
        >
          <span className="font-medium">/{command.name}</span>
          {command.description ? (
            <span className="truncate text-xs text-muted-foreground">{command.description}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

function MentionHint({
  query,
  onAccept
}: {
  query: string
  onAccept: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onAccept}
      className="absolute bottom-full left-3 right-3 mb-1 flex w-auto items-center gap-2 rounded-md border border-border bg-popover px-3 py-1.5 text-left text-xs text-muted-foreground shadow-md sm:left-4 sm:right-4"
    >
      {translate('components.native-chat.composer.mentionHint', 'Referencing file:')}{' '}
      <span className="font-medium text-foreground">@{query || '…'}</span>
    </button>
  )
}

/** Exposed for callers that need to know the active runtime is remote (e.g. to
 *  surface a "sending over SSH" hint). The send path itself already branches. */
export function composerTargetIsRemote(ptyId: string | null): boolean {
  return ptyId !== null && isRemoteRuntimePtyId(ptyId)
}
