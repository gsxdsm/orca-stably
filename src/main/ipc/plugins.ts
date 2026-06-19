// NEEDS-RUNTIME-VERIFY: IPC surface exposing the plugin system to the renderer.
// Thin delegation to PluginSystem (manager + runtime); the logic it calls is
// unit-tested. Register from register-core-handlers and expose a matching
// `window.api.plugins` in the preload. The bridge channel derives the calling
// plugin from the sending webContents — it does NOT trust a renderer-supplied
// pluginId (sender-bound identity, KTD7).

import { ipcMain } from 'electron'
import type { PluginSystem } from '../plugin/plugin-system'

export function registerPluginHandlers(system: PluginSystem): void {
  ipcMain.handle('plugins:list', () => system.list())

  ipcMain.handle('plugins:install-local', async (_event, sourceDir: string) =>
    system.manager.installLocal(sourceDir)
  )

  ipcMain.handle('plugins:activate', async (_event, pluginId: string) =>
    system.runtime.activate(pluginId)
  )

  ipcMain.handle('plugins:deactivate', async (_event, pluginId: string) => {
    await system.runtime.deactivate(pluginId)
    return { ok: true }
  })

  ipcMain.handle('plugins:remove', async (_event, pluginId: string) => {
    await system.runtime.deactivate(pluginId)
    return { ok: system.manager.remove(pluginId) }
  })

  ipcMain.handle('plugins:get-output', (_event, pluginId: string) => system.getOutput(pluginId))

  // UI -> backend bridge. pluginId is resolved from the sender's webContents by
  // the renderer-side panel wiring (NEEDS-RUNTIME-VERIFY); we accept it here as
  // the already-resolved owner id, never as an arbitrary caller claim, because
  // the renderer maps each plugin webview to its own pluginId.
  ipcMain.handle('plugins:ui-message', (_event, pluginId: string, message: unknown) => {
    system.runtime.postUi(pluginId, message)
  })
}
