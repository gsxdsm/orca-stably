import type { ValidDiscoveredPlugin } from '../discovery/plugin-discovery'
import type { PluginWorkerHandle } from './parent-process/plugin-host-process-types'
import type {
  PluginWorkerController,
  PluginWorkerControllerOptions
} from './plugin-worker-controller'
import type { PluginWorkerSpawnSpec } from './worker-supervision/plugin-worker-startup'
import type { PluginRunState } from './worker-supervision/plugin-supervisor'

/** Defers loading the plugin worker runtime until an approved worker plugin exists or runs. */
export class LazyPluginWorkerController {
  private controller: PluginWorkerController | null = null
  private loading: Promise<PluginWorkerController> | null = null

  constructor(private readonly options: PluginWorkerControllerOptions) {}

  private load(): Promise<PluginWorkerController> {
    if (this.controller) {
      return Promise.resolve(this.controller)
    }
    if (!this.loading) {
      const pending = import('./plugin-worker-controller').then(({ PluginWorkerController }) => {
        const instance = new PluginWorkerController(this.options)
        this.controller = instance
        return instance
      })
      this.loading = pending.catch((error: unknown) => {
        if (this.loading === pending) {
          this.loading = null
        }
        throw error
      })
    }
    return this.loading
  }

  runningHandle(pluginKey: string): PluginWorkerHandle | null {
    return this.controller?.runningHandle(pluginKey) ?? null
  }

  state(pluginKey: string): { state: PluginRunState; restarts: number } {
    return this.controller?.state(pluginKey) ?? { state: 'inactive', restarts: 0 }
  }

  activationError(pluginKey: string): string | null {
    return this.controller?.activationError(pluginKey) ?? null
  }

  async ensure(plugin: ValidDiscoveredPlugin): Promise<PluginWorkerHandle> {
    return (await this.load()).ensure(plugin)
  }

  async reconcile(
    nextSpecs: ReadonlyMap<string, PluginWorkerSpawnSpec>,
    findPlugin?: (pluginKey: string) => ValidDiscoveredPlugin | null
  ): Promise<void> {
    if (nextSpecs.size === 0 && !this.controller && !this.loading) {
      return
    }
    await (await this.load()).reconcile(nextSpecs, findPlugin)
  }

  reapIdle(): void {
    this.controller?.reapIdle()
  }

  async deactivate(pluginKey: string): Promise<void> {
    if (this.controller) {
      await this.controller.deactivate(pluginKey)
      return
    }
    if (this.loading) {
      await this.loading.then(
        (controller) => controller.deactivate(pluginKey),
        () => undefined
      )
    }
  }

  async dispose(): Promise<void> {
    if (this.controller) {
      await this.controller.dispose()
      return
    }
    if (this.loading) {
      await this.loading.then(
        (controller) => controller.dispose(),
        () => undefined
      )
    }
  }
}
