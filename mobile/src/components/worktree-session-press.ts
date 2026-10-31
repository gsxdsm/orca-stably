import { useRef } from 'react'
import {
  setSelectedSidebarSession,
  useSelectedSidebarSession
} from '../host-screen/selected-sidebar-session'

type SessionRowTarget = {
  worktreeId: string
  isActive?: boolean
}

// The session row is nested in the workspace pressable. Claim its touch so that press cannot replace it.
export function useWorktreeSessionPress(onPress: () => void): {
  claim: () => void
  release: () => void
  press: () => void
  isClaimed: () => boolean
} {
  const claimed = useRef(false)
  const onPressRef = useRef(onPress)
  onPressRef.current = onPress
  const handlers = useRef({
    claim: () => {
      claimed.current = true
    },
    release: () => {
      setTimeout(() => {
        claimed.current = false
      }, 0)
    },
    press: () => {
      if (claimed.current) {
        claimed.current = false
        return
      }
      onPressRef.current()
    },
    isClaimed: () => claimed.current
  })
  return handlers.current
}

// Remember the tapped session and keep the workspace press from treating that touch as its own.
export function useWorktreeRowSession<T extends SessionRowTarget>(
  item: T,
  selectable: boolean,
  onPress: (item: T) => void,
  onAgentPress?: (item: T, paneKey: string) => void
): {
  claim: () => void
  release: () => void
  press: () => void
  isClaimed: () => boolean
  highlightedPane: string | null
  openAgent?: (paneKey: string) => void
} {
  const selected = useSelectedSidebarSession()
  const sessionPress = useWorktreeSessionPress(() => {
    setSelectedSidebarSession(null)
    onPress(item)
  })
  let highlightedPane: string | null = null
  if (selectable && item.isActive && selected?.worktreeId === item.worktreeId) {
    highlightedPane = selected.paneKey
  }
  const openAgent = onAgentPress
    ? (paneKey: string) => {
        setSelectedSidebarSession({ worktreeId: item.worktreeId, paneKey })
        onAgentPress(item, paneKey)
      }
    : undefined
  return { ...sessionPress, highlightedPane, openAgent }
}
