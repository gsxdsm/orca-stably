import type { ClipboardEventHandler, KeyboardEventHandler, RefObject } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NATIVE_FILE_DROP_TARGET } from '../../../../shared/native-file-drop'
import type { ComposerAutocomplete, SlashCommandSuggestion } from './native-chat-composer-state'
import {
  NativeChatMentionHint,
  NativeChatSkillMenu,
  NativeChatSlashMenu
} from './NativeChatAutocompleteMenus'
import { NativeChatComposerActions } from './NativeChatComposerActions'
import { nativeChatComposerPlaceholder } from './native-chat-composer-target'
import type { DiscoveredSkill } from '../../../../shared/skills'

export type NativeChatComposerFieldProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  draft: string
  disabled: boolean
  hasPty: boolean
  canSend: boolean
  autocomplete: ComposerAutocomplete
  activeSuggestion: number
  notice: string | null
  sendButtonDisabled: boolean
  isWorking: boolean
  attachDisabled: boolean
  onDraftChange: (value: string, element: HTMLTextAreaElement) => void
  onTextareaSelect: (element: HTMLTextAreaElement) => void
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>
  onChooseSlash: (command: SlashCommandSuggestion) => void
  onAcceptMention: () => void
  onChooseSkill: (skill: DiscoveredSkill) => void
  onAttach: () => void
  onSend: () => void
  onStop?: () => void
}

export function NativeChatComposerField({
  textareaRef,
  draft,
  disabled,
  hasPty,
  canSend,
  autocomplete,
  activeSuggestion,
  notice,
  sendButtonDisabled,
  isWorking,
  attachDisabled,
  onDraftChange,
  onTextareaSelect,
  onKeyDown,
  onPaste,
  onChooseSlash,
  onAcceptMention,
  onChooseSkill,
  onAttach,
  onSend,
  onStop
}: NativeChatComposerFieldProps): React.JSX.Element {
  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="px-3 py-2 sm:px-4">
        <div className="relative mx-auto w-full max-w-3xl">
          {autocomplete.mode === 'slash' && autocomplete.suggestions.length > 0 ? (
            <NativeChatSlashMenu
              suggestions={autocomplete.suggestions}
              activeIndex={activeSuggestion}
              onChoose={onChooseSlash}
            />
          ) : null}
          {autocomplete.mode === 'mention' ? (
            <NativeChatMentionHint query={autocomplete.query} onAccept={onAcceptMention} />
          ) : null}
          {autocomplete.mode === 'skill' ? (
            <NativeChatSkillMenu
              suggestions={autocomplete.suggestions}
              activeIndex={activeSuggestion}
              onChoose={onChooseSkill}
            />
          ) : null}
          {notice ? (
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageOff className="size-3.5 shrink-0" />
              <span>{notice}</span>
            </div>
          ) : null}
          <div
            data-native-file-drop-target={NATIVE_FILE_DROP_TARGET.composer}
            className={cn(
              'rounded-xl border border-input bg-card p-2 shadow-xs transition-colors',
              'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30'
            )}
          >
            <textarea
              ref={textareaRef}
              value={draft}
              disabled={disabled}
              rows={3}
              onChange={(e) => onDraftChange(e.target.value, e.currentTarget)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onSelect={(e) => onTextareaSelect(e.currentTarget)}
              placeholder={nativeChatComposerPlaceholder(hasPty, canSend)}
              // Why: coarse-pointer min-height follows the app's touch target convention.
              className={cn(
                'min-h-20 max-h-40 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none pointer-coarse:min-h-24',
                'placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50'
              )}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div />
              <NativeChatComposerActions
                attachDisabled={attachDisabled}
                sendDisabled={sendButtonDisabled}
                isWorking={isWorking}
                onAttach={onAttach}
                onSend={onSend}
                onStop={onStop}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
