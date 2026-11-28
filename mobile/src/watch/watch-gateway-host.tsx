import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { OrcaWatchConnectivity } from '../../modules/orca-watch-connectivity/src'
import { mobileSessionRouteTarget } from '../session/mobile-session-route'
import { loadHostCatalog } from '../host-catalog/host-store'
import type { ConnectionState } from '../transport/connection/connection-state'
import { useAllHostClients } from '../transport/connection/use-all-host-clients'
import { useOpenNotificationRoute } from '../notifications/navigation/use-open-notification-route'
import { deriveHostFingerprint } from '../notifications/payload-identity/push-host-fingerprint'
import { watchUsagePaceSchema, type WatchHost } from './watch-contract'
import { watchGatewayEnabled } from './watch-gateway-availability'
import { startWatchGateway, type WatchLiveHost } from './watch-gateway-live'

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
  const usagePace = useRef<ReturnType<typeof watchUsagePaceSchema.parse> | undefined>(undefined)
  openRouteRef.current = openNotificationRoute
  const enabled = watchGatewayEnabled(Platform.OS, OrcaWatchConnectivity)
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string; fingerprint?: string }>>(
    []
  )
  const clients = useAllHostClients(enabled ? catalog.map((host) => host.id) : [])
  const gatewayRef = useRef<ReturnType<typeof startWatchGateway> | null>(null)
  const catalogRef = useRef(catalog)
  const clientsRef = useRef(clients)
  catalogRef.current = catalog
  clientsRef.current = clients

  function linkedHosts(): WatchLiveHost[] {
    const linked = new Map(catalogRef.current.map((host) => [host.id, host]))
    return clientsRef.current.flatMap((entry) => {
      const host = linked.get(entry.hostId)
      return host
        ? [
            {
              hostId: entry.hostId,
              name: host.name,
              fingerprint: host.fingerprint,
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
      void AsyncStorage.getItem('orca:usagePaceColorThresholds')
        .then((raw) => {
          if (!stopped) {
            usagePace.current =
              raw === null ? undefined : watchUsagePaceSchema.safeParse(JSON.parse(raw)).data
          }
        })
        .catch(() => {})
      void loadHostCatalog()
        .then((hosts) => {
          if (stopped) {
            return
          }
          setCatalog(
            hosts.map((host) => ({
              id: host.id,
              name: host.personalName?.trim() || host.name.trim() || host.id,
              fingerprint: deriveHostFingerprint(host.publicKeyB64) ?? undefined
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
        native?.updateContext(
          plainSnapshot({
            ...snapshot,
            ...(usagePace.current ? { usagePace: usagePace.current } : {})
          })
        )
      },
      sendReply(replyToken, reply) {
        const usage = reply.ok && reply.snapshot && usagePace.current
        native?.sendReply(
          replyToken,
          plainSnapshot(
            usage && reply.ok && reply.snapshot
              ? { ...reply, snapshot: { ...reply.snapshot, usagePace: usage } }
              : reply
          )
        )
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
                ...(target.paneKey ? { paneKey: target.paneKey } : {}),
                ...(target.kind === 'item' ? { botItem: target.id } : {})
              })
            : null
        })
      }
    })
    gatewayRef.current = gateway
    gateway.setHosts(linkedHosts())
    return () => {
      gateway.stop()
      gatewayRef.current = null
    }
  }, [enabled])

  useEffect(() => {
    gatewayRef.current?.setHosts(linkedHosts())
  }, [catalog, clients])

  return null
}
