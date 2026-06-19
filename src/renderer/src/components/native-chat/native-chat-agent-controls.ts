// Canonical (desktop) registry of native-chat agent control dropdowns.
//
// IMPORTANT: the mobile RN bundle CANNOT import these runtime values (Metro
// can't bundle values from outside mobile/). A hand-synced copy lives at
// mobile/src/session/mobile-native-chat-agent-controls.ts — keep both in sync.
// Only the TYPES are shared (src/shared/native-chat-agent-controls-types.ts).
//
// These are TUI agents with no structured control API: we drive them by feeding
// input into the pty. Each option declares the keyword/command/keystroke and the
// `mechanism` (prepend | command | raw) that the composer's send path honors.

import type {
  NativeChatAgentControls,
  NativeChatControl,
  NativeChatControlOption,
  NativeChatControlSelection
} from '../../../../shared/native-chat-agent-controls-types'

export type {
  NativeChatAgentControls,
  NativeChatControl,
  NativeChatControlOption,
  NativeChatControlSelection
} from '../../../../shared/native-chat-agent-controls-types'

// ─── Claude ─────────────────────────────────────────────────────────────────

// Thinking level (RELIABLE): Claude escalates reasoning when the message text
// begins with these keywords. Normal = no prefix; the others prepend a token.
// Wired into SEND (prepended to the draft), never sent as its own command.
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

// Model (best-effort, version-dependent): Claude Code accepts `/model <name>`.
// The exact accepted aliases shift between CLI versions; opus/sonnet/haiku are
// the stable family names. Sent as a standalone command on selection.
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
// Shift+Tab (escape seq `\x1b[Z`) — there's no jump-to-mode key, so we can't set
// a specific mode deterministically. The dropdown lists the modes for reference;
// selecting any of them sends ONE Shift+Tab cycle. We can't read which mode is
// active, so this advances by one rather than landing on the picked label.
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

// Codex has approval modes cycled with Shift+Tab (same escape seq) and accepts
// `/model`. It has no documented "thinking level" keyword, so that control is
// omitted. Model aliases are version-dependent; we expose the common ones.
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

// ─── Resolution ───────────────────────────────────────────────────────────────

const EMPTY_CONTROLS: NativeChatAgentControls = {}

/** Resolve the control set for an agent. Unknown agents get no controls (we
 *  don't invent commands we can't justify); only render what's returned. */
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
    byId ??
    control.options.find((o) => o.id === control.defaultOptionId) ??
    control.options[0]
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

/**
 * Apply the thinking prefix to an outgoing draft. The prefix already carries its
 * trailing space; an empty prefix is a no-op so Normal sends the draft verbatim.
 * Pure — used by both composers' send and unit-tested directly.
 */
export function applyThinkingPrefix(prefix: string, draft: string): string {
  if (prefix === '') {
    return draft
  }
  return `${prefix}${draft}`
}
