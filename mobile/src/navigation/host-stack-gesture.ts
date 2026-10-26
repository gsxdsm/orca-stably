import { createContext, useContext } from 'react'

/** False while the host stack's swipe-back is off (split view); screens that set their own option must respect it. */
export const HostStackGestureContext = createContext(true)

export function useHostStackGestureEnabled(): boolean {
  return useContext(HostStackGestureContext)
}
