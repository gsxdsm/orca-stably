import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { findControlOption } from './native-chat-agent-controls'
import type {
  NativeChatAgentControls,
  NativeChatControl,
  NativeChatControlSelection
} from './native-chat-agent-controls'

export type NativeChatControlBarProps = {
  controls: NativeChatAgentControls
  selection: NativeChatControlSelection
  disabled?: boolean
  /** Pick an option. Thinking stays in state; mode/model also fire their send. */
  onSelect: (control: NativeChatControl, optionId: string) => void
}

/**
 * Compact, left-aligned toolbar of the agent control dropdowns (Mode / Thinking
 * / Model) shown inside the enlarged composer box. Only the controls the
 * resolved agent supports are rendered. Single-option controls (Mode cycle) read
 * as an action button rather than a stateful picker.
 */
export function NativeChatControlBar({
  controls,
  selection,
  disabled = false,
  onSelect
}: NativeChatControlBarProps): React.JSX.Element | null {
  const ordered = [controls.mode, controls.thinking, controls.model].filter(
    (c): c is NativeChatControl => c != null
  )
  if (ordered.length === 0) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ordered.map((control) => (
        <ControlDropdown
          key={control.kind}
          control={control}
          selectedId={selection[control.kind]}
          disabled={disabled}
          onSelect={(optionId) => onSelect(control, optionId)}
        />
      ))}
    </div>
  )
}

function ControlDropdown({
  control,
  selectedId,
  disabled,
  onSelect
}: {
  control: NativeChatControl
  selectedId: string | undefined
  disabled: boolean
  onSelect: (optionId: string) => void
}): React.JSX.Element {
  // A cycle-style control (single option, e.g. Claude permission mode) is an
  // action, not a selection — show the control label, not a current value.
  const isAction = control.options.length <= 1
  const active = findControlOption(control, selectedId)
  const triggerLabel = isAction ? control.label : active.label

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={control.note ?? undefined}
          aria-label={`${control.label}: ${active.label}`}
          className={cn(
            'flex h-7 items-center gap-1 rounded-md border border-input bg-transparent px-2 text-xs font-medium text-foreground/80 shadow-xs transition-colors',
            'hover:bg-accent hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-9'
          )}
        >
          {!isAction ? (
            <span className="text-muted-foreground/70">{control.label}</span>
          ) : null}
          <span>{triggerLabel}</span>
          <ChevronDown className="size-3 text-muted-foreground/70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {control.note ? (
          <>
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              {control.note}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {control.options.map((option) => {
          const selected = !isAction && option.id === active.id
          return (
            <DropdownMenuItem
              key={option.id}
              onSelect={() => onSelect(option.id)}
              className="flex-col items-start gap-0"
            >
              <span className="flex w-full items-center gap-2">
                {!isAction ? (
                  <Check
                    className={cn('size-3.5', selected ? 'opacity-100' : 'opacity-0')}
                  />
                ) : null}
                <span>{option.label}</span>
              </span>
              {option.description ? (
                <span className={cn('text-[11px] text-muted-foreground', !isAction && 'pl-[1.375rem]')}>
                  {option.description}
                </span>
              ) : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
