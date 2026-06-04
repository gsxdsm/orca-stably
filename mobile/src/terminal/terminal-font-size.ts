import AsyncStorage from '@react-native-async-storage/async-storage'

const TERMINAL_FONT_SIZE_KEY = 'orca:terminal-font-size'

export const DEFAULT_TERMINAL_FONT_SIZE = 13
export const MIN_TERMINAL_FONT_SIZE = 10
export const MAX_TERMINAL_FONT_SIZE = 24

export function clampTerminalFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TERMINAL_FONT_SIZE
  }
  return Math.min(MAX_TERMINAL_FONT_SIZE, Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(value)))
}

export async function loadTerminalFontSize(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(TERMINAL_FONT_SIZE_KEY)
    if (raw === null) {
      return DEFAULT_TERMINAL_FONT_SIZE
    }
    return clampTerminalFontSize(Number(raw))
  } catch {
    return DEFAULT_TERMINAL_FONT_SIZE
  }
}

export async function saveTerminalFontSize(fontSize: number): Promise<void> {
  await AsyncStorage.setItem(TERMINAL_FONT_SIZE_KEY, String(clampTerminalFontSize(fontSize)))
}
