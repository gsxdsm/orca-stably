import { useEffect, useRef } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { runtimeStatusProbeEpoch } from '../transport/runtime-status-probe'
import type { ConnectionState } from '../transport/types'
import { composeWorktreeHostIdentity } from '../../../src/shared/worktree/host-qualified-identity'
import {
  deleteCachedNewTabAgentInventory,
  getCachedNewTabAgentInventory,
  setCachedNewTabAgentInventory
} from '../cache/new-tab-agent-inventory-cache'
import { useWorkspaceExecutionHost } from '../navigation/workspace-execution-host'
import {
  hostRefusesOtherRuntimeWorkspace,
  loadMobileNewTabAgentOptions,
  MobileWorkspaceOnOtherRuntimeError
} from './mobile-new-tab-agent-loader'
import type { MobileNewTabAgentOption } from './mobile-new-tab-agent-options'
import type { MobileNewTabAgentLoadState } from './mobile-session-route-types'
import {
  loadMobileStructuredChatLaunchContext,
  withMobileStructuredChatLaunch
} from './mobile-structured-chat-launch'

// A login-shell refresh resets shared desktop state, so it runs once per workspace per connection.
const refreshedTargets = new WeakMap<RpcClient, { epoch: string; targets: Set<string> }>()

function refreshedThisConnection(client: RpcClient): Set<string> {
  const epoch = runtimeStatusProbeEpoch(client)
  let entry = refreshedTargets.get(client)
  if (entry?.epoch !== epoch) {
    entry = { epoch, targets: new Set() }
    refreshedTargets.set(client, entry)
  }
  return entry.targets
}

export function useMobileNewTabAgentOptions(args: {
  client: RpcClient | null
  connState: ConnectionState
  hostId: string
  hostCapabilities: readonly string[] | null | undefined
  worktreeId: string
  open: boolean
  setLoadState: (state: MobileNewTabAgentLoadState) => void
  setOptions: (options: MobileNewTabAgentOption[]) => void
}): void {
  const {
    client,
    connState,
    hostCapabilities,
    hostId,
    worktreeId,
    open,
    setLoadState,
    setOptions
  } = args
  const hostRefusesOtherRuntime = hostRefusesOtherRuntimeWorkspace(args.hostCapabilities)
  // Include execution host because relayed servers can share workspace ids.
  const workspaceKey = composeWorktreeHostIdentity(useWorkspaceExecutionHost(), worktreeId)
  const observedTargetsRef = useRef(new Set<string>())
  useEffect(() => {
    if (!open || !client || connState !== 'connected') {
      setLoadState('idle')
      setOptions([])
      return
    }

    let stale = false
    const cachedInventory = getCachedNewTabAgentInventory(hostId, workspaceKey)
    const cached = cachedInventory
      ? {
          ...cachedInventory,
          options: cachedInventory.options.map(({ agent, label }) => ({
            agent,
            label
          }))
        }
      : null
    // Mirror the desktop detection rule locally because its hook depends on the desktop store.
    const observedTargets = observedTargetsRef.current
    const target = `${hostId}\u0000${workspaceKey}\u0000${hostRefusesOtherRuntime}`
    const observed = observedTargets.has(target)
    const refreshed = refreshedThisConnection(client)
    const refresh = !observed && !refreshed.has(target) && Boolean(cached?.detectedAgents.length)
    setLoadState(cached ? 'loaded' : 'loading')
    setOptions(cached?.options ?? [])

    // Mark on send: the desktop finishes the refresh even if this sheet closes first.
    if (refresh) {
      refreshed.add(target)
    }
    void (async () => {
      const inventory = await loadMobileNewTabAgentOptions({
        client,
        worktreeId,
        hostRefusesOtherRuntime,
        settled: observed ? cached : null,
        refresh
      })
      if (stale) {
        return
      }
      observedTargets.add(target)
      const launchContext = await loadMobileStructuredChatLaunchContext({
        client,
        hostCapabilities
      }).catch(() => null)
      if (stale) {
        return
      }
      const options = withMobileStructuredChatLaunch(inventory.options, launchContext)
      const snapshotUnproven = hostCapabilities == null || hostCapabilities.length === 0
      // An empty gate list is not a host answer. Caching it would keep the hint off after status arrives.
      if (!snapshotUnproven || options.some((option) => option.opensAsChat)) {
        setCachedNewTabAgentInventory(hostId, workspaceKey, inventory)
      }
      setOptions(options)
      setLoadState('loaded')
    })().catch((error: unknown) => {
      if (stale) {
        return
      }
      const otherRuntime = error instanceof MobileWorkspaceOnOtherRuntimeError
      if (otherRuntime) {
        deleteCachedNewTabAgentInventory(hostId, workspaceKey)
      }
      // Failed refresh does not uninstall previously listed agents.
      if (otherRuntime || !cached) {
        setOptions([])
        setLoadState(otherRuntime ? 'other-runtime' : 'error')
      }
    })

    return () => {
      stale = true
    }
  }, [
    client,
    connState,
    hostCapabilities,
    hostId,
    hostRefusesOtherRuntime,
    open,
    setLoadState,
    setOptions,
    workspaceKey,
    worktreeId
  ])
}
