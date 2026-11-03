import { useEffect, useRef, useState } from 'react'
import { shouldClearNativeChatWorkingSuppression } from '../../../../shared/native-chat/native-chat-working-suppression'

export function useNativeChatWorkingSuppression(working: boolean, workingEpoch: number | null) {
  const [interrupted, setInterrupted] = useState(false)
  const previousEpoch = useRef<number | null>(null)
  useEffect(() => {
    if (
      shouldClearNativeChatWorkingSuppression({
        working,
        interrupted,
        workingEpoch,
        previousWorkingEpoch: previousEpoch.current
      })
    ) {
      setInterrupted(false)
    }
    if (working && workingEpoch !== null) {
      previousEpoch.current = workingEpoch
    }
    if (!working) {
      previousEpoch.current = null
    }
  }, [working, interrupted, workingEpoch])
  return [interrupted, setInterrupted] as const
}
