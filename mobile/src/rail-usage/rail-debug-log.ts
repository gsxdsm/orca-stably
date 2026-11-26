import AsyncStorage from '@react-native-async-storage/async-storage'

// TEMPORARY: a record of every side-strip cover report and rail decision, read off the device's
// app container to find why rings vanish after a worker chat. Remove once that is fixed.
export const RAIL_DEBUG_LOG_KEY = 'orca:debug:railLog'
const MAX = 400

let entries: Record<string, unknown>[] | null = null
let pending: Record<string, unknown>[] = []
let timer: ReturnType<typeof setTimeout> | null = null

async function flush(): Promise<void> {
  timer = null
  if (entries === null) {
    try {
      const raw = await AsyncStorage.getItem(RAIL_DEBUG_LOG_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      entries = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
    } catch {
      entries = []
    }
  }
  entries = [...entries, ...pending].slice(-MAX)
  pending = []
  try {
    await AsyncStorage.setItem(RAIL_DEBUG_LOG_KEY, JSON.stringify(entries))
  } catch {
    // Debug only.
  }
}

export function railDebug(event: string, data: Record<string, unknown>): void {
  pending.push({ t: new Date().toISOString(), event, ...data })
  if (timer === null) {
    timer = setTimeout(() => void flush(), 400)
  }
}
