import { requireOptionalNativeModule, type NativeModule } from 'expo-modules-core'

export type WatchCommandEvent = {
  replyToken: string
  command: Record<string, unknown>
  receivedAt: number
  jsRegisteredAt: number
}

type WatchConnectivityEvents = {
  onCommand: (event: WatchCommandEvent) => void
}

declare class OrcaWatchConnectivityModule extends NativeModule<WatchConnectivityEvents> {
  start(): void
  sendReply(replyToken: string, reply: Record<string, unknown>): void
  updateContext(context: Record<string, unknown>): void
}

/** Null on web and in a binary built before this module existed. Android links a no-op. */
export const OrcaWatchConnectivity =
  requireOptionalNativeModule<OrcaWatchConnectivityModule>('OrcaWatchConnectivity')
