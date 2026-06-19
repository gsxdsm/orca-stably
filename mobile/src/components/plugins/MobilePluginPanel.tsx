import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import type { RpcClient } from '../../transport/rpc-client'

// NEEDS-RUNTIME-VERIFY: plugin HTML is fetched from the relay host (plugin.getEntry),
// not served on-device, because no Node runs on the phone. UI messages round-trip
// to the relay-hosted backend via plugin.bridge.

type Props = { client: RpcClient; pluginId: string }

type GetEntryResult = { ok?: boolean; html?: string }

export function MobilePluginPanel({ client, pluginId }: Props): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setFailed(false)
    client
      .sendRequest('plugin.getEntry', { pluginId })
      .then((response) => {
        if (cancelled) {
          return
        }
        const result = response.ok ? (response.result as GetEntryResult) : undefined
        if (result?.ok && typeof result.html === 'string') {
          setHtml(result.html)
        } else {
          setFailed(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [client, pluginId])

  const onMessage = (event: WebViewMessageEvent): void => {
    try {
      const request = JSON.parse(event.nativeEvent.data)
      void client.sendRequest('plugin.bridge', { pluginId, request })
    } catch {
      // Ignore non-JSON messages from the plugin UI.
    }
  }

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>This plugin failed to load.</Text>
      </View>
    )
  }
  if (html === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      onMessage={onMessage}
      javaScriptEnabled
      style={styles.webview}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  error: { color: '#ff6b6b', fontSize: 13 },
  webview: { flex: 1, backgroundColor: 'transparent' }
})
