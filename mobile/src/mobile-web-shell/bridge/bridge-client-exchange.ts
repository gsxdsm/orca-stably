import type { RpcClient } from '../../transport/rpc/rpc-client-contract'
import type { SendRequestOptions } from '../../transport/rpc/unvalidated-rpc-request-port'
import type { RpcResponse } from '../../transport/rpc/rpc-wire-types'
import { BRIDGE_MAX_PENDING_REQUESTS, BRIDGE_MAX_SUBSCRIPTIONS } from './bridge-caps'
import {
  BridgeClientCapExceededError,
  BridgeClientClosedError,
  BridgeRequestOversizedError,
  BridgeSendFailedError
} from './bridge-client-errors'
import type { BridgeClientRequests } from './bridge-client-requests'
import { readBridgeRequestFrameOptions, readBridgeRpcEnvelope } from './bridge-client-rpc-envelope'
import type { BridgeClientSubscriptions } from './bridge-client-subscriptions'
import { BRIDGE_PROTOCOL_VERSION, type BridgeClientMessage } from './bridge-envelope'

type BridgeFrameSendOutcome = 'sent' | 'oversized' | 'port-failed'

export type BridgeClientExchangeDeps = {
  requireSession: () => void
  isClosed: () => boolean
  requests: BridgeClientRequests
  subscriptions: BridgeClientSubscriptions
  nextId: () => string
  sendFrame: (frame: BridgeClientMessage) => BridgeFrameSendOutcome
  hasGrant: (name: string) => boolean
}

// Request and subscribe stay together: both open an id, post one frame, and refuse when the lane is capped. Page close still belongs to the client, because it also stops the handshake, claims, cache, and session.
export function createBridgeClientExchange(
  deps: BridgeClientExchangeDeps
): Pick<RpcClient, 'sendRequest' | 'subscribe'> {
  const { requireSession, isClosed, requests, subscriptions, nextId, sendFrame, hasGrant } = deps

  function sendRequest(...args: [string, unknown?, SendRequestOptions?]): Promise<RpcResponse> {
    // Missing session is a synchronous mount-order bug; in-flight cap refusal instead rejects like the shell’s response.
    requireSession()
    if (isClosed()) {
      // Return a rejected promise: deferred operations hand it back directly, so synchronous throws would bypass callers’ promise catches.
      return Promise.reject(new BridgeClientClosedError())
    }
    if (requests.size >= BRIDGE_MAX_PENDING_REQUESTS) {
      return Promise.reject(
        new BridgeClientCapExceededError(`over ${BRIDGE_MAX_PENDING_REQUESTS} requests in flight`)
      )
    }
    const [method, params, requestOptions] = args
    return new Promise<RpcResponse>((resolve, reject) => {
      const frameOptions = readBridgeRequestFrameOptions(requestOptions, hasGrant)
      const id = nextId()
      requests.open(id, { resolve, reject })
      const outcome = sendFrame({
        v: BRIDGE_PROTOCOL_VERSION,
        type: 'request',
        id,
        method,
        // Preserve absent params for replayed arity. JSON cannot carry explicit undefined, so that spelling necessarily arrives as the absent form.
        ...(args.length > 1 ? { params } : {}),
        ...frameOptions
      })
      if (outcome !== 'sent') {
        requests.abandon(id)
        // Both failures prove nothing was sent; distinguish oversize so the caller can retry a smaller action.
        reject(
          outcome === 'oversized' ? new BridgeRequestOversizedError() : new BridgeSendFailedError()
        )
      }
    })
  }

  function subscribe(
    method: string,
    params: unknown,
    onData: (result: unknown) => void,
    subscribeOptions?: Parameters<RpcClient['subscribe']>[3]
  ): () => void {
    requireSession()
    if (isClosed()) {
      return () => undefined
    }
    // Subscribe returns only cleanup, so local refusal throws; asynchronous shell refusal instead reports through the stream diagnostic.
    if (subscriptions.size >= BRIDGE_MAX_SUBSCRIPTIONS) {
      throw new BridgeClientCapExceededError(`over ${BRIDGE_MAX_SUBSCRIPTIONS} subscriptions`)
    }
    const { onBinaryFrame, envelope: fields } = subscribeOptions ?? {}
    const envelope = readBridgeRpcEnvelope(fields, hasGrant)
    const id = nextId()
    // Failed posting already freed the slot and notified its listener; still return an idempotent cleanup.
    if (!subscriptions.open(id, method, params, onData, onBinaryFrame, envelope)) {
      return () => undefined
    }
    let disposed = false
    return () => {
      if (disposed) {
        return
      }
      disposed = true
      subscriptions.cancel(id)
    }
  }

  return { sendRequest, subscribe }
}
