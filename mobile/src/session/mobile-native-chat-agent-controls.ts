// Mobile-local copy of the native-chat agent control registry.
//
// Why duplicated: the RN bundle can only `import type` from src/shared (Metro
// can't bundle runtime values from outside mobile/). These VALUES mirror the
// canonical desktop registry at
// src/renderer/src/components/native-chat/native-chat-agent-controls.ts — keep
// both in sync. Only the TYPES cross the boundary (imported below). This mirrors
// how mobile-native-chat-blocks.ts inlines values from native-chat-types.ts.

import type {
  NativeChatAgentControls,
  NativeChatControl,
  NativeChatControlOption,
  NativeChatControlSelection
} from '../../../src/shared/native-chat-agent-controls-types'

export type {
  NativeChatAgentControls,
  NativeChatControl,
  NativeChatControlOption,
  NativeChatControlSelection
} from '../../../src/shared/native-chat-agent-controls-types'

// ─── Claude ─────────────────────────────────────────────────────────────────

// Thinking level (RELIABLE): prepended to the message text at SEND time.
const CLAUDE_THINKING: NativeChatControl = {
  kind: 'thinking',
  label: 'Thinking',
  mechanism: 'prepend',
  defaultOptionId: 'normal',
  options: [
    { id: 'normal', label: 'Normal', payload: '' },
    { id: 'think', label: 'Think', payload: 'think ' },
    { id: 'think-hard', label: 'Think hard', payload: 'think hard ' },
    { id: 'ultrathink', label: 'Ultrathink', payload: 'ultrathink ' }
  ]
}

// Model (best-effort, version-dependent): `/model <name>` sent on selection.
const CLAUDE_MODEL: NativeChatControl = {
  kind: 'model',
  label: 'Model',
  mechanism: 'command',
  defaultOptionId: 'sonnet',
  note: 'Sends /model — accepted names are Claude-CLI-version dependent.',
  options: [
    { id: 'opus', label: 'Opus', payload: '/model opus' },
    { id: 'sonnet', label: 'Sonnet', payload: '/model sonnet' },
    { id: 'haiku', label: 'Haiku', payload: '/model haiku' }
  ]
}

// Mode (best-effort, most fragile): Claude permission modes only CYCLE via
// Shift+Tab (\x1b[Z) — no jump-to-mode key, so selecting sends one cycle.
const SHIFT_TAB = '\x1b[Z'
const CLAUDE_MODE: NativeChatControl = {
  kind: 'mode',
  label: 'Mode',
  mechanism: 'raw',
  defaultOptionId: 'cycle',
  note: 'Claude has no jump-to-mode key — selecting cycles permission mode (Shift+Tab).',
  options: [
    {
      id: 'cycle',
      label: 'Cycle permission mode',
      description: 'Shift+Tab — advances Normal → Auto-accept → Plan …',
      payload: SHIFT_TAB
    }
  ]
}

const CLAUDE_CONTROLS: NativeChatAgentControls = {
  mode: CLAUDE_MODE,
  thinking: CLAUDE_THINKING,
  model: CLAUDE_MODEL
}

// ─── Codex ──────────────────────────────────────────────────────────────────

const CODEX_MODE: NativeChatControl = {
  kind: 'mode',
  label: 'Mode',
  mechanism: 'raw',
  defaultOptionId: 'cycle',
  note: 'Codex cycles approval mode with Shift+Tab — no jump-to-mode key.',
  options: [
    {
      id: 'cycle',
      label: 'Cycle approval mode',
      description: 'Shift+Tab — advances the approval policy',
      payload: SHIFT_TAB
    }
  ]
}

const CODEX_MODEL: NativeChatControl = {
  kind: 'model',
  label: 'Model',
  mechanism: 'command',
  defaultOptionId: 'gpt-5-codex',
  note: 'Sends /model — accepted names are Codex-CLI-version dependent.',
  options: [
    { id: 'gpt-5-codex', label: 'GPT-5 Codex', payload: '/model gpt-5-codex' },
    { id: 'gpt-5', label: 'GPT-5', payload: '/model gpt-5' }
  ]
}

const CODEX_CONTROLS: NativeChatAgentControls = {
  mode: CODEX_MODE,
  model: CODEX_MODEL
}

const EMPTY_CONTROLS: NativeChatAgentControls = {}

/** Resolve the control set for an agent. Unknown agents get no controls. */
export function resolveNativeChatAgentControls(agent: string): NativeChatAgentControls {
  const normalized = agent.toLowerCase()
  if (normalized === 'claude' || normalized === 'openclaude') {
    return CLAUDE_CONTROLS
  }
  if (normalized === 'codex') {
    return CODEX_CONTROLS
  }
  return EMPTY_CONTROLS
}

/** The default selection (per control kind) for a resolved control set. */
export function defaultNativeChatControlSelection(
  controls: NativeChatAgentControls
): NativeChatControlSelection {
  return {
    mode: controls.mode?.defaultOptionId,
    thinking: controls.thinking?.defaultOptionId,
    model: controls.model?.defaultOptionId
  }
}

/** Look up an option by id within a control, falling back to its default. */
export function findControlOption(
  control: NativeChatControl,
  optionId: string | undefined
): NativeChatControlOption {
  const byId = optionId ? control.options.find((o) => o.id === optionId) : undefined
  return (
    byId ?? control.options.find((o) => o.id === control.defaultOptionId) ?? control.options[0]
  )
}

/** The thinking-keyword prefix for the current selection, or '' (no prepend). */
export function thinkingPrefixForSelection(
  controls: NativeChatAgentControls,
  selection: NativeChatControlSelection
): string {
  if (!controls.thinking) {
    return ''
  }
  return findControlOption(controls.thinking, selection.thinking).payload
}

/** Apply the thinking prefix to an outgoing draft (no-op for the empty prefix). */
export function applyThinkingPrefix(prefix: string, draft: string): string {
  if (prefix === '') {
    return draft
  }
  return `${prefix}${draft}`
}
