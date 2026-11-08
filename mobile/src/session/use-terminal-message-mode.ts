import { useCallback, useEffect, useRef, useState } from 'react'
import type { TextInput } from 'react-native'
import {
  loadTerminalMessageModeHandles,
  saveTerminalMessageModeHandles
} from '../storage/preferences'

const MAX_REMEMBERED_HANDLES = 64

// Each terminal remembers Keys (live, the default) or Message (write a line, then Send).
export function useTerminalMessageMode({
  hostId,
  worktreeId,
  activeHandle
}: {
  hostId: string
  worktreeId: string
  activeHandle: string | null
}) {
  const [messageHandles, setMessageHandles] = useState<ReadonlySet<string>>(() => new Set())
  const messageHandlesRef = useRef(messageHandles)
  const hydratedRef = useRef(false)
  const pendingEditsRef = useRef(new Map<string, boolean>())
  const [terminalDrafts, setTerminalDrafts] = useState<ReadonlyMap<string, string>>(() => new Map())
  const messageInputRef = useRef<TextInput | null>(null)

  const commit = useCallback((next: ReadonlySet<string>) => {
    messageHandlesRef.current = next
    setMessageHandles(next)
  }, [])

  useEffect(() => {
    hydratedRef.current = false
    pendingEditsRef.current = new Map()
    commit(new Set())
    setTerminalDrafts(new Map())
    let disposed = false
    void loadTerminalMessageModeHandles(hostId, worktreeId).then((stored) => {
      if (disposed) {
        return
      }
      // A toggle made before the stored modes arrived wins over them.
      for (const [handle, message] of pendingEditsRef.current) {
        if (message) {
          stored.add(handle)
        } else {
          stored.delete(handle)
        }
      }
      hydratedRef.current = true
      if (pendingEditsRef.current.size > 0) {
        void saveTerminalMessageModeHandles(hostId, worktreeId, stored).catch(() => {})
      }
      pendingEditsRef.current = new Map()
      commit(stored)
    })
    return () => {
      disposed = true
    }
  }, [commit, hostId, worktreeId])

  const toggleTerminalMessageMode = useCallback(
    (handle: string): boolean => {
      const next = new Set(messageHandlesRef.current)
      const message = !next.has(handle)
      if (message) {
        next.add(handle)
      } else {
        next.delete(handle)
      }
      const kept = new Set([...next].slice(-MAX_REMEMBERED_HANDLES))
      commit(kept)
      if (hydratedRef.current) {
        void saveTerminalMessageModeHandles(hostId, worktreeId, kept).catch(() => {})
      } else {
        pendingEditsRef.current.set(handle, message)
      }
      return message
    },
    [commit, hostId, worktreeId]
  )

  const setTerminalDraft = useCallback(
    (handle: string, update: string | ((current: string) => string)) => {
      setTerminalDrafts((prev) => {
        const current = prev.get(handle) ?? ''
        const text = typeof update === 'function' ? update(current) : update
        if (text === current) {
          return prev
        }
        const next = new Map(prev)
        if (text.length === 0) {
          next.delete(handle)
        } else {
          next.set(handle, text)
        }
        return next
      })
    },
    []
  )

  return {
    terminalMessageMode: activeHandle !== null && messageHandles.has(activeHandle),
    toggleTerminalMessageMode,
    terminalDraft: (activeHandle && terminalDrafts.get(activeHandle)) || '',
    setTerminalDraft,
    messageInputRef
  }
}
