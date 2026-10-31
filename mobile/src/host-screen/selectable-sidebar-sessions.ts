// Phone-only. Desktop already opens a session from its row, so this stays off the synced view settings.
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'orca.selectableSidebarSessions'

let selectable = false
const listeners = new Set<() => void>()
let loadStarted = false

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function getSelectableSidebarSessions(): boolean {
  return selectable
}

export function subscribeSelectableSidebarSessions(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setSelectableSidebarSessions(next: boolean): void {
  if (selectable === next) {
    return
  }
  selectable = next
  emit()
  void persistSelectableSidebarSessions(next)
}

export function useSelectableSidebarSessions(): boolean {
  ensureSelectableSidebarSessionsLoaded()
  return useSyncExternalStore(
    subscribeSelectableSidebarSessions,
    getSelectableSidebarSessions,
    getSelectableSidebarSessions
  )
}

function ensureSelectableSidebarSessionsLoaded(): void {
  if (loadStarted) {
    return
  }
  loadStarted = true
  void readSelectableSidebarSessions()
}

async function readSelectableSidebarSessions(): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const stored = await AsyncStorage.getItem(STORAGE_KEY)
    const next = stored === '1'
    if (next !== selectable) {
      selectable = next
      emit()
    }
  } catch {
    // Stay off for this launch when the phone cannot read the preference.
  }
}

async function persistSelectableSidebarSessions(next: boolean): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    await AsyncStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  } catch {
    // The toggle still applies for this launch when storage is unavailable.
  }
}
