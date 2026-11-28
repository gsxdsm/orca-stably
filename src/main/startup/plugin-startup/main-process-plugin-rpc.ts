import type { Store } from '../../persistence/loading-store/store'
import {
  applyPluginConsent,
  applyPluginEnablement
} from '../../plugins/activation/plugin-enablement'
import type { PluginService } from '../../plugins/plugin-service'
import type { PluginCliCatalogs } from '../../plugins/cli/plugin-cli-catalog-candidates'
import {
  setPluginInstallServicesForRpc,
  setPluginServiceForRpc
} from '../../runtime/rpc/methods/plugins/plugin-rpc-slots'

/** Headless RPC resolves these too; consent shares the desktop hash-keyed write path. */
export function bindPluginRpcServices(
  store: Store,
  pluginService: PluginService,
  catalogs: PluginCliCatalogs
): void {
  setPluginServiceForRpc(pluginService, {
    applyConsent: (request) => applyPluginConsent({ store, pluginService, ...request }),
    applyEnablement: (pluginKey, enabled) =>
      applyPluginEnablement({ store, pluginService, pluginKey, enabled }),
    setPluginSystemEnabled: (pluginSystemEnabled) =>
      store.updateSettings({ pluginSystemEnabled }, { notifyListeners: true }),
    setDevPluginPaths: (devPluginPaths) =>
      store.updateSettings({ devPluginPaths }, { notifyListeners: true }),
    openFrameDevTools: async (pluginKey) => {
      const { openPluginFrameGuestDevTools } =
        await import('../../plugins/panels/guest-isolation/plugin-frame-guest-diagnostics')
      return openPluginFrameGuestDevTools(pluginKey)
    }
  })
  setPluginInstallServicesForRpc({
    pluginService,
    catalogs,
    applyConsent: (request) => applyPluginConsent({ store, pluginService, ...request }),
    store,
    afterUninstall: async (pluginKey) => {
      const { clearPluginFrameStorage } =
        await import('../../plugins/panels/guest-isolation/plugin-frame-guest-sessions')
      return clearPluginFrameStorage(pluginKey)
    }
  })
}
