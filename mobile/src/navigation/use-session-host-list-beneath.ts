import { useLayoutEffect, useRef } from 'react'
import { useNavigation } from 'expo-router'
import type { HostStackNavigationRoute, HostStackNavigationState } from './host-stack-navigation'

type SessionStackNavigation = {
  addListener: (event: 'state', listener: () => void) => () => void
  dispatch: (action: { type: 'RESET'; target?: string; payload: HostStackNavigationState }) => void
  getState: () => HostStackNavigationState | undefined
}

const HOST_INDEX_SCREEN = '[hostId]/index'
const HOST_SESSION_SCREEN = '[hostId]/session/[worktreeId]'

function hostParamMatches(param: unknown, expectedHostId: string): boolean {
  if (typeof param !== 'string') {
    return false
  }
  if (param === expectedHostId) {
    return true
  }
  try {
    return decodeURIComponent(param) === expectedHostId
  } catch {
    return false
  }
}

function focusedHostRoute(state: HostStackNavigationState): HostStackNavigationRoute | null {
  let current: HostStackNavigationState | undefined = state
  while (current) {
    const route: HostStackNavigationRoute | undefined =
      current.routes[current.index ?? current.routes.length - 1]
    if (!route) {
      return null
    }
    if (route.name === 'h') {
      return route
    }
    current = route.state
  }
  return null
}

function levelContainsHostSession(level: HostStackNavigationState, hostId: string): boolean {
  return level.routes.some(
    (route) => route.name === HOST_SESSION_SCREEN && hostParamMatches(route.params?.hostId, hostId)
  )
}

function sessionHostStackLevel(
  state: HostStackNavigationState,
  hostId: string
): HostStackNavigationState | null {
  const nested = focusedHostRoute(state)?.state
  if (nested && levelContainsHostSession(nested, hostId)) {
    return nested
  }
  if (levelContainsHostSession(state, hostId)) {
    return state
  }
  return null
}

// Insert the host list immediately before its session. Null when that list is already underneath.
function withHostSessionListBeneath(
  level: HostStackNavigationState,
  hostId: string
): { index: number; routes: HostStackNavigationRoute[] } | null {
  let sessionIndex = -1
  for (let index = level.index ?? level.routes.length - 1; index >= 0; index -= 1) {
    const route = level.routes[index]
    if (route?.name === HOST_SESSION_SCREEN && hostParamMatches(route.params?.hostId, hostId)) {
      sessionIndex = index
      break
    }
  }
  if (sessionIndex < 0) {
    return null
  }
  for (let index = 0; index < sessionIndex; index += 1) {
    const route = level.routes[index]
    if (route?.name === HOST_INDEX_SCREEN && hostParamMatches(route.params?.hostId, hostId)) {
      return null
    }
  }
  const sessionHostId = level.routes[sessionIndex]?.params?.hostId
  const routes = [
    ...level.routes.slice(0, sessionIndex),
    {
      key: `host-session-list:${hostId}`,
      name: HOST_INDEX_SCREEN,
      params: { hostId: typeof sessionHostId === 'string' ? sessionHostId : hostId }
    },
    ...level.routes.slice(sessionIndex)
  ]
  const levelIndex = level.index ?? level.routes.length - 1
  return { index: levelIndex >= sessionIndex ? levelIndex + 1 : levelIndex, routes }
}

// Repair a web session opened with no host list under it. Native navigation pushes over the list instead.
export function useSessionHostListBeneath(hostId: string | null): void {
  const navigation = useNavigation<SessionStackNavigation>()
  const attemptedHost = useRef<string | null>(null)
  const seenHost = useRef(hostId)
  if (seenHost.current !== hostId) {
    seenHost.current = hostId
    attemptedHost.current = null
  }

  useLayoutEffect(() => {
    if (
      !hostId ||
      typeof navigation.getState !== 'function' ||
      typeof navigation.addListener !== 'function' ||
      typeof navigation.dispatch !== 'function'
    ) {
      return
    }
    const apply = () => {
      if (attemptedHost.current === hostId) {
        return
      }
      const state = navigation.getState()
      const level = state && sessionHostStackLevel(state, hostId)
      if (!level) {
        return
      }
      const next = withHostSessionListBeneath(level, hostId)
      // Mark before dispatch: the reset emits state, and a second insert would loop.
      attemptedHost.current = hostId
      if (!next) {
        return
      }
      navigation.dispatch({
        type: 'RESET',
        ...(level.key ? { target: level.key } : {}),
        payload: { ...level, index: next.index, routes: next.routes }
      })
    }
    apply()
    return navigation.addListener('state', apply)
  }, [hostId, navigation])
}
