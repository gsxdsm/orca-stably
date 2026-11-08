import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { OrcaWatchConnectivity } from '../../modules/orca-watch-connectivity/src'
import { mobileSessionRouteTarget } from '../session/mobile-session-route'
import { loadHostCatalog } from '../transport/hosts/host-store'
import type { ConnectionState } from '../transport/connection/connection-state'
import { useAllHostClients } from '../transport/connection/use-all-host-clients'
import { useOpenNotificationRoute } from '../notifications/use-open-notification-route'
import type { WatchHost } from './watch-contract'
import { watchGatewayEnabled } from './watch-gateway-availability'
import { startWatchGateway, type WatchLiveHost } from './watch-gateway-live'
import { setWatchPromptResponseHandler } from './watch-prompt-actions'

function watchConnection(state: ConnectionState): WatchHost['connection'] {
  if (state === 'connected') {
    return 'connected'
  }
  if (state === 'disconnected' || state === 'auth-failed') {
    return 'offline'
  }
  return 'connecting'
}

function plainSnapshot(snapshot: unknown): Record<string, unknown> {
  const parsed: unknown = JSON.parse(JSON.stringify(snapshot))
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.fromEntries(Object.entries(parsed))
    : {}
}

export function WatchGatewayHost() {
  const openNotificationRoute = useOpenNotificationRoute()
  const openRouteRef = useRef(openNotificationRoute)
  openRouteRef.current = openNotificationRoute
  const enabled = watchGatewayEnabled(Platform.OS, OrcaWatchConnectivity)
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string }>>([])
  const clients = useAllHostClients(enabled ? catalog.map((host) => host.id) : [])
  const gatewayRef = useRef<ReturnType<typeof startWatchGateway> | null>(null)
  const catalogRef = useRef(catalog)
  const clientsRef = useRef(clients)
  catalogRef.current = catalog
  clientsRef.current = clients

  function linkedHosts(): WatchLiveHost[] {
    const names = new Map(catalogRef.current.map((host) => [host.id, host.name]))
    return clientsRef.current.flatMap((entry) => {
      const name = names.get(entry.hostId)
      return name
        ? [
            {
              hostId: entry.hostId,
              name,
              connection: watchConnection(entry.state),
              client: entry.client
            }
          ]
        : []
    })
  }

  useEffect(() => {
    if (!enabled) {
      return
    }
    let stopped = false
    const load = () => {
      void loadHostCatalog()
        .then((hosts) => {
          if (stopped) {
            return
          }
          setCatalog(
            hosts.map((host) => ({
              id: host.id,
              name: host.personalName?.trim() || host.name.trim() || host.id
            }))
          )
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const native = OrcaWatchConnectivity
    const gateway = startWatchGateway({
      push(snapshot) {
        native?.updateContext(plainSnapshot(snapshot))
      },
      sendReply(replyToken, reply) {
        native?.sendReply(replyToken, plainSnapshot(reply))
      },
      subscribeCommands(onCommand) {
        if (!native) {
          return () => {}
        }
        const subscription = native.addListener('onCommand', onCommand)
        native.start()
        return () => subscription.remove()
      },
      openSession(target) {
        openRouteRef.current({
          hostId: target.hostId,
          sessionTarget: target.workspaceId
            ? mobileSessionRouteTarget({
                hostId: target.hostId,
                worktreeId: target.workspaceId,
                ...(target.paneKey ? { paneKey: target.paneKey } : {})
              })
            : null
        })
      }
    })
    gatewayRef.current = gateway
    gateway.setHosts(linkedHosts())
    const stopActions = setWatchPromptResponseHandler((response) => {
      gateway.handleNotification(response)
    })
    return () => {
      stopActions()
      gateway.stop()
      gatewayRef.current = null
    }
  }, [enabled])

  useEffect(() => {
    gatewayRef.current?.setHosts(linkedHosts())
  }, [catalog, clients])

  return null
}
