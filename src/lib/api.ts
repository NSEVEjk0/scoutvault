import type { AuthSession, Bounty, ListingBaseline, PublicConfig } from '../../shared/types';

const bootstrapOrigin = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export let apiOrigin = bootstrapOrigin;
let activeConfig: PublicConfig | null = null;

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, options: RequestInit = {}, session?: AuthSession | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (session) headers.set('Authorization', `Bearer ${session.token}`);
  const response = await fetch(`${path.startsWith('/config') ? bootstrapOrigin : apiOrigin}/api${path}`, { ...options, headers, signal: options.signal ?? AbortSignal.timeout(90000) });
  const data = await response.json().catch(() => ({ error: 'ScoutVault could not read the response. Please try again.' }));
  if (!response.ok) throw new ApiError(data.error ?? 'That request could not be completed. Please try again.', response.status);
  return data as T;
}

export const getConfig = async () => { const config = await api<PublicConfig>(`/config${new URLSearchParams(location.search).get('demo') === 'local' ? '?demo=local' : ''}`); apiOrigin = config.apiUrl; activeConfig = config; return config; };
export const getBounties = (session: AuthSession | null, latitude?: number, longitude?: number) => {
  const query = latitude !== undefined && longitude !== undefined ? `?lat=${latitude}&lng=${longitude}&radius=2000` : '';
  return api<{ bounties: Bounty[]; paidCount: number }>(`/bounties${query}`, {}, session);
};
export const getBounty = (id: string, session: AuthSession | null) => api<Bounty>(`/bounties/${id}`, {}, session);
export const readListing = (url: string) => api<ListingBaseline>('/listings/read', { method: 'POST', body: JSON.stringify({ url }) });

export interface PreparedTransaction {
  id: string;
  preparedId: string;
  transaction: string;
  minContextSlot: number;
  lastValidBlockHeight: number;
  blockhash: string;
  estimatedFeeSol?: number;
  estimatedRentSol?: number;
}

export const prepare = (path: string, body: unknown, session: AuthSession) => api<PreparedTransaction>(path, {
  method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body),
}, session);

export const shortAddress = (value?: string) => value ? `${value.slice(0, 4)}…${value.slice(-4)}` : 'Connect wallet';
export const transactionUrl = (signature: string) => `https://explorer.solana.com/tx/${signature}?${activeConfig?.network === 'localnet' ? `cluster=custom&customUrl=${encodeURIComponent(activeConfig.rpcUrl)}` : 'cluster=devnet'}`;
export const rewardText = (reward: string) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(Number(reward));
export const dateText = (date: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));
