import { prefixRpcMethodGroup, type LazyRpcMethodGroup } from '../lazy-rpc-method-group'

export const LAZY_HOST_RPC_METHOD_GROUPS: readonly LazyRpcMethodGroup[] = [
  prefixRpcMethodGroup(
    [],
    async () => (await import('./host-management/desktop-window')).DESKTOP_WINDOW_METHODS,
    { exactNames: ['desktop.openWindowInBackground'] }
  ),
  prefixRpcMethodGroup(
    ['agentHooks.'],
    async () => (await import('./agent-hooks/agent-hooks')).AGENT_HOOK_METHODS
  ),
  prefixRpcMethodGroup(
    [],
    async () => (await import('./host-management/host-capabilities')).HOST_CAPABILITY_METHODS,
    {
      exactNames: [
        'host.platform',
        'host.wsl.isAvailable',
        'host.wsl.listDistros',
        'host.pwsh.isAvailable',
        'host.gitBash.isAvailable'
      ]
    }
  ),
  prefixRpcMethodGroup([], async () => (await import('./host-resources')).HOST_RESOURCES_METHODS, {
    exactNames: ['host.resources']
  }),
  prefixRpcMethodGroup(
    [],
    async () =>
      (await import('./client-events/runtime-client-capabilities'))
        .RUNTIME_CLIENT_CAPABILITY_METHODS,
    { exactNames: ['runtime.clientCapabilities.update'] }
  ),
  prefixRpcMethodGroup(
    [],
    async () => (await import('./sidebar-inputs/sidebar-repo-icons')).SIDEBAR_REPO_ICON_METHODS,
    { exactNames: ['sidebarInputs.repoIcons'] }
  )
]
