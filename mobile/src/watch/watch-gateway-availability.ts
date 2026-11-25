/** Android links a no-op module, so a linked module there must not open host RPC. */
export function watchGatewayEnabled(os: string, nativeModule: unknown): boolean {
  return os === 'ios' && nativeModule != null
}
