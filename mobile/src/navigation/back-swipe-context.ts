import { createContext } from 'react'
import type { InteractiveBackSwipe } from './back-swipe'

export const BackSwipeContext = createContext<(() => InteractiveBackSwipe | null) | null>(null)
