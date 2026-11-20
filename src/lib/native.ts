interface NativeMessage { id: string; method: string; params: unknown }
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
    __SCOUTVAULT_NATIVE__?: boolean;
    __scoutvaultReceive?: (message: { id: string; result?: unknown; error?: string }) => void;
  }
}

const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
window.__scoutvaultReceive = message => {
  const operation = pending.get(message.id);
  if (!operation) return;
  clearTimeout(operation.timeout);
  pending.delete(message.id);
  if (message.error) operation.reject(new Error(message.error));
  else operation.resolve(message.result);
};

export const isNative = () => !!window.__SCOUTVAULT_NATIVE__ && !!window.ReactNativeWebView;

export function nativeCall<T>(method: string, params: unknown = {}): Promise<T> {
  if (!isNative()) return Promise.reject(new Error('Open ScoutVault in the Android app to use this action.'));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('The phone did not respond. Please try again.')); }, 120000);
    pending.set(id, { resolve: value => resolve(value as T), reject, timeout });
    const message: NativeMessage = { id, method, params };
    window.ReactNativeWebView!.postMessage(JSON.stringify(message));
  });
}

export async function currentLocation(): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  if (isNative()) return nativeCall('getLocation');
  if (!navigator.geolocation) throw new Error('This browser cannot read your location. Choose a place on the map.');
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    result => resolve({ latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy }),
    error => reject(new Error(error.code === 1 ? 'Location is blocked. Allow location access, or choose a place on the map.' : 'Your location could not be read. Move into the open and try again.')),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 },
  ));
}
