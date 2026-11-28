import type { AgentBrowserBridge } from '../../../browser/agent-browser/agent-browser-bridge'
import type { BrowserBackend } from '../../../browser/browser-backend'
import { RuntimeWorkspaceNavigation } from '../../workspaces/startup/runtime-workspace-navigation'

export abstract class RuntimeBrowserHostBindings extends RuntimeWorkspaceNavigation {
  private agentBrowserBridgeLoader: (() => Promise<AgentBrowserBridge>) | null = null
  private agentBrowserBridgePromise: Promise<AgentBrowserBridge | null> | null = null

  // Why: browser profiles change in main's session registry, outside runtime methods.
  notifyBrowserProfilesChanged(): void {
    this.notifier?.browserProfilesChanged?.()
    this.emitClientEvent({ type: 'browserProfilesChanged' })
  }

  setAgentBrowserBridge(bridge: AgentBrowserBridge | null): void {
    this.agentBrowserBridge = bridge
    this.agentBrowserBridgeLoader = null
    this.agentBrowserBridgePromise = null
  }

  setAgentBrowserBridgeLoader(loader: (() => Promise<AgentBrowserBridge>) | null): void {
    this.agentBrowserBridgeLoader = loader
    this.agentBrowserBridgePromise = null
  }

  getAgentBrowserBridge(): AgentBrowserBridge | null {
    return this.agentBrowserBridge
  }

  ensureAgentBrowserBridge(): Promise<AgentBrowserBridge | null> {
    if (this.agentBrowserBridge) {
      return Promise.resolve(this.agentBrowserBridge)
    }
    const loader = this.agentBrowserBridgeLoader
    if (!loader) {
      return Promise.resolve(null)
    }
    if (!this.agentBrowserBridgePromise) {
      const pending = loader()
        .then((bridge) => {
          this.agentBrowserBridge = bridge
          return bridge
        })
        .catch((error: unknown) => {
          if (this.agentBrowserBridgePromise === pending) {
            this.agentBrowserBridgePromise = null
          }
          throw error
        })
      this.agentBrowserBridgePromise = pending
    }
    return this.agentBrowserBridgePromise
  }

  setOffscreenBrowserBackend(backend: BrowserBackend | null): void {
    this.offscreenBrowserBackend = backend
  }

  getOffscreenBrowserBackend(): BrowserBackend | null {
    return this.offscreenBrowserBackend
  }
}
