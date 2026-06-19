// The client a plugin's UI bundle uses to talk to its backend. Detects the host
// substrate so one UI bundle works on both desktop and mobile:
//   - mobile (react-native-webview): window.ReactNativeWebView.postMessage +
//     'message' events carrying JSON strings.
//   - desktop (Electron <webview>/iframe): window.parent.postMessage + 'message'
//     events carrying structured data.
// Authors vendor this file (or import the published SDK). It is messaging-only
// (matching context.ui's generic post/subscribe); request/response is the
// author's convention on top.
//
// NEEDS-RUNTIME-VERIFY: the exact desktop post target (guest <webview> ->
// renderer) is confirmed when the renderer panel wiring lands and the app runs.
// Substrate detection and the mobile path are unit-tested here.

export type UiBridge = {
  postMessage(message: unknown): void
  onMessage(handler: (message: unknown) => void): () => void
}

type ReactNativeWebViewWindow = {
  ReactNativeWebView?: { postMessage(data: string): void }
  parent?: { postMessage(data: unknown, targetOrigin: string): void }
  postMessage?(data: unknown, targetOrigin: string): void
  addEventListener?(type: string, listener: (event: { data: unknown }) => void): void
  removeEventListener?(type: string, listener: (event: { data: unknown }) => void): void
}

export function isReactNativeSubstrate(win: ReactNativeWebViewWindow): boolean {
  return typeof win.ReactNativeWebView?.postMessage === 'function'
}

export function createUiBridge(win: ReactNativeWebViewWindow): UiBridge {
  const reactNative = isReactNativeSubstrate(win)

  const postMessage = (message: unknown): void => {
    if (reactNative) {
      win.ReactNativeWebView!.postMessage(JSON.stringify(message))
      return
    }
    // Desktop: post up to the embedder. NEEDS-RUNTIME-VERIFY target.
    const target = win.parent ?? win
    target.postMessage?.(message, '*')
  }

  const onMessage = (handler: (message: unknown) => void): (() => void) => {
    const listener = (event: { data: unknown }): void => {
      // RN delivers JSON strings; desktop delivers structured data.
      if (reactNative && typeof event.data === 'string') {
        try {
          handler(JSON.parse(event.data))
        } catch {
          handler(event.data)
        }
      } else {
        handler(event.data)
      }
    }
    win.addEventListener?.('message', listener)
    return () => win.removeEventListener?.('message', listener)
  }

  return { postMessage, onMessage }
}
