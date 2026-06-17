import type { LogicalKey } from './tty-key-adapter'

/** The subset of Ink's `Key` flags the dashboard reacts to. Ink's full Key is
 *  structurally assignable to this. */
export type InkKey = {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  return: boolean
  escape: boolean
  tab: boolean
  backspace: boolean
  delete: boolean
  ctrl: boolean
}

/** Translate Ink's (input, key) into the same LogicalKey the keybinding layer
 *  matches on, so navigation routes through one tested resolver. */
export function inkKeyToLogical(input: string, key: InkKey): LogicalKey | null {
  if (key.upArrow) {
    return { type: 'up' }
  }
  if (key.downArrow) {
    return { type: 'down' }
  }
  if (key.leftArrow) {
    return { type: 'left' }
  }
  if (key.rightArrow) {
    return { type: 'right' }
  }
  if (key.return) {
    return { type: 'enter' }
  }
  if (key.escape) {
    return { type: 'escape' }
  }
  if (key.tab) {
    return { type: 'tab' }
  }
  if (key.backspace || key.delete) {
    return { type: 'backspace' }
  }
  if (key.ctrl && input.length > 0) {
    return { type: 'ctrl', value: input.toLowerCase() }
  }
  if (input.length === 1 && input >= ' ') {
    return { type: 'char', value: input }
  }
  return null
}
