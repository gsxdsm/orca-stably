import type { PluginPanelController } from './plugin-panel-controller'

export type PluginPanelControllerOptions = ConstructorParameters<typeof PluginPanelController>[0]
export type PluginPanelControllerSurface = Pick<PluginPanelController, keyof PluginPanelController>

/** Defers loading the plugin panel controller until a plugin panel or custom editor is opened. */
export class LazyPluginPanelController implements PluginPanelControllerSurface {
  private controller: PluginPanelController | null = null
  private loading: Promise<PluginPanelController> | null = null
  private disposed = false
  private readonly pendingOwnerSignals = new Map<string, AbortSignal>()

  constructor(private readonly options: PluginPanelControllerOptions) {}

  private load(): Promise<PluginPanelController> {
    if (this.controller) {
      return Promise.resolve(this.controller)
    }
    if (!this.loading) {
      const pending = import('./plugin-panel-controller').then(
        ({ PluginPanelController: Ctor }) => {
          const instance = new Ctor(this.options)
          for (const [ownerKey, signal] of this.pendingOwnerSignals) {
            instance.bindOwnerSignal(ownerKey, signal)
          }
          this.pendingOwnerSignals.clear()
          if (this.disposed) {
            instance.dispose()
          }
          this.controller = instance
          return instance
        }
      )
      this.loading = pending.catch((error: unknown) => {
        if (this.loading === pending) {
          this.loading = null
        }
        throw error
      })
    }
    return this.loading
  }

  sessionCaller: PluginPanelController['sessionCaller'] = (ownerKey, sessionToken) =>
    this.controller?.sessionCaller(ownerKey, sessionToken) ?? null

  readEntry: PluginPanelController['readEntry'] = async (...args) =>
    (await this.load()).readEntry(...args)

  open: PluginPanelController['open'] = async (...args) => (await this.load()).open(...args)

  openCustomEditor: PluginPanelController['openCustomEditor'] = async (...args) =>
    (await this.load()).openCustomEditor(...args)

  componentsPanelPlugin: PluginPanelController['componentsPanelPlugin'] = (
    ownerKey,
    sessionToken
  ) => this.controller?.componentsPanelPlugin(ownerKey, sessionToken) ?? null

  componentsPanelRoot: PluginPanelController['componentsPanelRoot'] = (ownerKey, sessionToken) =>
    this.controller?.componentsPanelRoot(ownerKey, sessionToken) ?? null

  revokeSession: PluginPanelController['revokeSession'] = (ownerKey, sessionToken) => {
    if (this.controller) {
      this.controller.revokeSession(ownerKey, sessionToken)
      return
    }
    if (this.loading) {
      void this.loading.then(
        (controller) => controller.revokeSession(ownerKey, sessionToken),
        () => undefined
      )
    }
  }

  execute: PluginPanelController['execute'] = async (...args) =>
    (await this.load()).execute(...args)

  revokeOwner: PluginPanelController['revokeOwner'] = (ownerKey) => {
    this.pendingOwnerSignals.delete(ownerKey)
    if (this.controller) {
      this.controller.revokeOwner(ownerKey)
      return
    }
    if (this.loading) {
      void this.loading.then(
        (controller) => controller.revokeOwner(ownerKey),
        () => undefined
      )
    }
  }

  bindOwnerSignal: PluginPanelController['bindOwnerSignal'] = (ownerKey, signal) => {
    if (!signal) {
      return
    }
    if (this.controller) {
      this.controller.bindOwnerSignal(ownerKey, signal)
      return
    }
    if (signal.aborted) {
      this.revokeOwner(ownerKey)
      return
    }
    this.pendingOwnerSignals.set(ownerKey, signal)
    signal.addEventListener(
      'abort',
      () => {
        if (this.pendingOwnerSignals.get(ownerKey) === signal) {
          this.pendingOwnerSignals.delete(ownerKey)
        }
      },
      { once: true }
    )
  }

  revokeAll: PluginPanelController['revokeAll'] = () => {
    this.pendingOwnerSignals.clear()
    if (this.controller) {
      this.controller.revokeAll()
      return
    }
    if (this.loading) {
      void this.loading.then(
        (controller) => controller.revokeAll(),
        () => undefined
      )
    }
  }

  dispose: PluginPanelController['dispose'] = () => {
    this.disposed = true
    this.pendingOwnerSignals.clear()
    if (this.controller) {
      this.controller.dispose()
    }
  }
}
