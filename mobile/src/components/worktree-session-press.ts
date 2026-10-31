import { useRef } from 'react'

// The session row is nested in the workspace pressable. Claim its touch so that press cannot replace it.
export function useWorktreeSessionPress(onPress: () => void): {
  claim: () => void
  release: () => void
  press: () => void
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
    }
  })
  return handlers.current
}
