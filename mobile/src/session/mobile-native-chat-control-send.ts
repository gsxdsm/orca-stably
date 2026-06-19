import type { RpcClient } from '../transport/rpc-client'

// Agent control payloads that are NOT message body: raw control bytes (Shift+Tab
// \x1b[Z to cycle permission/approval mode, enter:false) or a standalone command
// line (`/model …`, enter:true). Sent via terminal.send so SSH panes work too.
export function sendMobileNativeChatControl(args: {
  client: RpcClient | null
  terminal: string | null
  deviceToken: string | null
  payload: string
  enter: boolean
}): void {
  const { client, terminal, deviceToken, payload, enter } = args
  if (!client || !terminal) {
    return
  }
  void client
    .sendRequest('terminal.send', {
      terminal,
      text: payload,
      enter,
      ...(deviceToken ? { client: { id: deviceToken, type: 'mobile' as const } } : {})
    })
    .catch(() => {
      // Transient send failure; the control selection stays in the composer.
    })
}
