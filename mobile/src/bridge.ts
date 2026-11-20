export const supportedMethods = new Set(['connect', 'disconnect', 'signMessage', 'sendTransaction', 'capture', 'getLocation', 'speak', 'stopSpeech']);
export interface BridgeRequest { id: string; method: string; params: Record<string, unknown> }

export function readBridgeRequest(raw: string, pageUrl: string, trustedOrigin: string): BridgeRequest {
  if (raw.length > 20000) throw new Error('The app request is too large.');
  if (new URL(pageUrl).origin !== new URL(trustedOrigin).origin) throw new Error('Wallet requests are only accepted from ScoutVault.');
  const request = JSON.parse(raw);
  if (typeof request.id !== 'string' || request.id.length > 100 || !supportedMethods.has(request.method)) throw new Error('Unknown app request.');
  if (!request.params || typeof request.params !== 'object' || Array.isArray(request.params)) throw new Error('Invalid app request.');
  return request;
}
