// Shared TYPES for the native-chat agent control dropdowns (Mode / Thinking /
// Model). Only TYPES live in src/shared so the mobile RN bundle can `import type`
// across the boundary (Metro can't bundle runtime values from outside mobile/).
// The runtime registry VALUES are defined twice — desktop in
// native-chat-agent-controls.ts, mobile in mobile-native-chat-agent-controls.ts
// — and must be kept in sync. This mirrors how mobile-native-chat-blocks.ts
// inlines the values from native-chat-types.ts.

/** Which control a registry entry drives. */
export type NativeChatControlKind = 'mode' | 'thinking' | 'model'

/**
 * How a control's selection is delivered to the agent's TUI over the pty. These
 * agents have no structured control API — we drive them by feeding input:
 *  - `prepend`: the option contributes a keyword prefix to the NEXT sent message
 *    (Claude thinking levels: `think `, `think hard `, `ultrathink `). Wired into
 *    the composer's send, NOT sent as its own command.
 *  - `command`: the option sends a standalone command line + Enter immediately on
 *    selection (e.g. `/model opus`). Goes through the framed-body+Enter send.
 *  - `raw`: the option writes a raw control string immediately (e.g. Shift+Tab
 *    `\x1b[Z` to cycle Claude permission modes). Goes through the raw send path.
 */
export type NativeChatControlMechanism = 'prepend' | 'command' | 'raw'

export type NativeChatControlOption = {
  /** Stable id, unique within its control (persists selection state). */
  id: string
  /** Human label shown in the dropdown. */
  label: string
  /** Optional one-line hint shown under the label. */
  description?: string
  /**
   * The payload for the option's mechanism:
   *  - prepend: the keyword prefix (may be '' for the "no prepend" default).
   *  - command: the full command line sent (Enter appended by the send path).
   *  - raw: the raw control bytes written to the pty.
   */
  payload: string
}

export type NativeChatControl = {
  kind: NativeChatControlKind
  /** Short label for the dropdown trigger (e.g. "Mode", "Thinking", "Model"). */
  label: string
  mechanism: NativeChatControlMechanism
  options: NativeChatControlOption[]
  /** Id of the option selected by default. */
  defaultOptionId: string
  /**
   * Optional limitation note surfaced in UI / comments. Used for the fragile
   * controls (Mode cycling, version-dependent /model) so the UX stays honest.
   */
  note?: string
}

/** The full set of controls a resolved agent supports. */
export type NativeChatAgentControls = {
  mode?: NativeChatControl
  thinking?: NativeChatControl
  model?: NativeChatControl
}

/** Per-control selection state held by a composer (keyed by control kind). */
export type NativeChatControlSelection = {
  mode?: string
  thinking?: string
  model?: string
}
