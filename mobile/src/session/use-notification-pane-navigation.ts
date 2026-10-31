import { useEffect, useRef, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { firstParam } from '../navigation/route-param-reader'
import { usePageBridgeClient } from '../transport/client-context.web'
import type { MobileSessionTab } from './mobile-session-route-types'
import { notificationPaneTab } from './notification-pane-tab'

// The document at / receives pane requests through shell init. A host-area page also names the pane
// on its own route, which never reaches that init.
// Erase every arrival to repair lost clears, but switch once per value so replay cannot undo a later tab pick.
// Keep pending requests in a ref until terminal inventory arrives, avoiding a stale selection render.
export function useNotificationPaneNavigation({
  sessionTabs,
  terminalsLoaded,
  switchSessionTab
}: {
  sessionTabs: MobileSessionTab[]
  terminalsLoaded: boolean
  switchSessionTab: (tab: MobileSessionTab) => void
}) {
  const client = usePageBridgeClient()
  const { setParams } = useRouter()
  const setParamsRef = useRef(setParams)
  setParamsRef.current = setParams
  const localPaneKey = firstParam(useLocalSearchParams<{ paneKey?: string | string[] }>().paneKey)
  // The opening tap arrives only in the initial init, before route-update listeners.
  const opened = client.getShellSession()?.route?.params?.paneKey ?? null
  const pending = useRef(opened !== null && opened !== '' ? opened : localPaneKey || null)
  const applied = useRef<string | null>(null)
  const sawLocalPane = useRef(false)
  // Shell init and the document route can both carry the opening pane. Apply the shell one once.
  const suppressInitialLocal = useRef((opened ?? '') !== '' && localPaneKey !== '')
  const [asked, setAsked] = useState(0)

  useEffect(() => {
    // Acknowledge the initial init separately; read from the client to keep the effect keyed only on client.
    const seed = client.getShellSession()?.route?.params?.paneKey ?? null
    if (seed !== null && seed !== '') {
      client.clearRouteParam('paneKey', seed)
    }
    return client.onRouteUpdate((route) => {
      const paneKey = route?.params?.paneKey ?? ''
      if (paneKey === '') {
        // An erased route permits a later tap for the same pane.
        applied.current = null
        return
      }
      // Retry clear on every arrival so a lost acknowledgement is repaired even when switching is deduped.
      client.clearRouteParam('paneKey', paneKey)
      if (paneKey === applied.current) {
        return
      }
      pending.current = paneKey
      setAsked((count) => count + 1)
    })
  }, [client])

  useEffect(() => {
    if (suppressInitialLocal.current) {
      suppressInitialLocal.current = false
      if (localPaneKey !== '') {
        setParamsRef.current({ paneKey: '' })
      }
      return
    }
    if (localPaneKey === '') {
      // Clearing the document param is what makes the next tap of the same session a new request.
      if (sawLocalPane.current) {
        applied.current = null
        sawLocalPane.current = false
      }
      return
    }
    sawLocalPane.current = true
    setParamsRef.current({ paneKey: '' })
    if (localPaneKey === applied.current) {
      return
    }
    pending.current = localPaneKey
    setAsked((count) => count + 1)
  }, [localPaneKey])

  useEffect(() => {
    const paneKey = pending.current
    if (paneKey === null || paneKey === '' || !terminalsLoaded) {
      return
    }
    applied.current = paneKey
    const tab = notificationPaneTab(sessionTabs, paneKey)
    // A pre-reconnect inventory can predate the pane named by the push.
    if (tab) {
      pending.current = null
      switchSessionTab(tab)
    }
  }, [asked, sessionTabs, switchSessionTab, terminalsLoaded])
}
