import type { LogicalKey } from './tty-key-adapter'

/** Every keyboard-driven action the dashboard exposes. Navigation actions are
 *  bound here; the action layer (U6) wires the mutating ones to RPCs. */
export type TuiAction =
  | 'move-up'
  | 'move-down'
  | 'open'
  | 'back'
  | 'quit'
  | 'help'
  | 'refresh'
  | 'new-worktree'
  | 'remove-worktree'
  | 'new-terminal'
  | 'send-input'

export type Platform = 'mac' | 'other'

export function currentPlatform(platform: string = process.platform): Platform {
  return platform === 'darwin' ? 'mac' : 'other'
}

type Binding = {
  action: TuiAction
  /** Short hint shown in the status bar / help overlay. */
  hint: string
  matches: (key: LogicalKey) => boolean
}

function isChar(value: string): (key: LogicalKey) => boolean {
  return (key) => key.type === 'char' && key.value === value
}

const BINDINGS: Binding[] = [
  { action: 'move-up', hint: 'move up', matches: (k) => k.type === 'up' || isChar('k')(k) },
  { action: 'move-down', hint: 'move down', matches: (k) => k.type === 'down' || isChar('j')(k) },
  { action: 'open', hint: 'open', matches: (k) => k.type === 'enter' },
  { action: 'back', hint: 'back', matches: (k) => k.type === 'escape' },
  {
    action: 'quit',
    hint: 'quit',
    matches: (k) => isChar('q')(k) || (k.type === 'ctrl' && k.value === 'c')
  },
  { action: 'help', hint: 'help', matches: isChar('?') },
  {
    action: 'refresh',
    hint: 'refresh',
    matches: (k) => isChar('r')(k) || (k.type === 'ctrl' && k.value === 'r')
  },
  { action: 'new-worktree', hint: 'new worktree', matches: isChar('n') },
  { action: 'new-terminal', hint: 'new terminal', matches: isChar('c') },
  { action: 'remove-worktree', hint: 'remove', matches: isChar('x') },
  { action: 'send-input', hint: 'send', matches: isChar('s') }
]

/** First action whose binding matches the key, or null. */
export function resolveAction(key: LogicalKey): TuiAction | null {
  return BINDINGS.find((binding) => binding.matches(key))?.action ?? null
}

const ACTION_HINTS = new Map(BINDINGS.map((b) => [b.action, b.hint]))

export function actionHint(action: TuiAction): string {
  return ACTION_HINTS.get(action) ?? action
}

/** Human label for a chord, platform-aware per AGENTS.md. Control is rendered
 *  with the macOS ⌃ glyph on Mac and `Ctrl+` elsewhere; terminals deliver real
 *  Control on every platform, so we never remap it to Command. */
export function describeKey(key: LogicalKey, platform: Platform = currentPlatform()): string {
  switch (key.type) {
    case 'ctrl':
      return platform === 'mac' ? `⌃${key.value.toUpperCase()}` : `Ctrl+${key.value.toUpperCase()}`
    case 'char':
      return key.value
    case 'up':
      return '↑'
    case 'down':
      return '↓'
    case 'left':
      return '←'
    case 'right':
      return '→'
    case 'enter':
      return 'Enter'
    case 'escape':
      return 'Esc'
    case 'tab':
      return 'Tab'
    case 'backspace':
      return 'Backspace'
  }
}
