import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Buffer } from 'buffer';
import type { Transaction } from '@solana/web3.js';
import type { AuthSession, Challenge, PublicConfig } from '../../shared/types';
import { toBase64 } from '../../shared/canonical';
import { api, type PreparedTransaction } from './api';
import { isNative, nativeCall } from './native';

interface BrowserWallet {
  publicKey?: { toBase58: () => string };
  connect: () => Promise<{ publicKey: { toBase58: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array } | Uint8Array>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
}
declare global { interface Window { phantom?: { solana?: BrowserWallet }; solana?: BrowserWallet; solflare?: BrowserWallet } }

type DemoSessions = { buyer: AuthSession; scout: AuthSession; demoId: string };
interface WalletState {
  config: PublicConfig | null;
  session: AuthSession | null;
  demo: DemoSessions | null;
  busy: boolean;
  balance: { tokens: number; sol: number } | null;
  connect: () => Promise<void>;
  startDemo: () => Promise<void>;
  setDemoRole: (role: 'buyer' | 'scout') => void;
  disconnect: () => void;
  signMessage: (message: string) => Promise<string>;
  send: (prepared: PreparedTransaction) => Promise<string>;
  refreshBalance: () => Promise<void>;
  faucet: () => Promise<void>;
}
const WalletContext = createContext<WalletState | null>(null);
const storagePrefix = new URLSearchParams(location.search).get('demo') === 'local' ? 'scoutvault-local' : 'scoutvault';
const sessionKey = `${storagePrefix}-session`;
const demoKey = `${storagePrefix}-demo`;
const demoIdKey = `${storagePrefix}-demo-id`;

const valid = (session: AuthSession | null) => session && new Date(session.expiresAt).getTime() > Date.now() + 10000;

export function WalletProvider({ config, children }: { config: PublicConfig | null; children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => {
    try { const data = JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null'); return valid(data) ? data : null; } catch { return null; }
  });
  const [demo, setDemo] = useState<DemoSessions | null>(() => {
    try { const data = JSON.parse(sessionStorage.getItem(demoKey) ?? 'null'); return data && valid(data.buyer) && valid(data.scout) ? data : null; } catch { return null; }
  });
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<{ tokens: number; sol: number } | null>(null);
  const [browserWallet, setBrowserWallet] = useState<BrowserWallet | null>(null);

  useEffect(() => {
    if (session) sessionStorage.setItem(sessionKey, JSON.stringify(session));
    else sessionStorage.removeItem(sessionKey);
  }, [session]);

  const refreshBalance = useCallback(async () => {
    if (!session) { setBalance(null); return; }
    try { setBalance(await api('/wallet/balance', {}, session)); } catch { setBalance(null); }
  }, [session]);
  useEffect(() => { void refreshBalance(); }, [refreshBalance]);

  const connect = async () => {
    setBusy(true);
    try {
      let wallet: string;
      let sign: (message: string) => Promise<string>;
      if (isNative()) {
        const account = await nativeCall<{ wallet: string }>('connect');
        wallet = account.wallet;
        sign = message => nativeCall<string>('signMessage', { message });
      } else {
        const provider = window.phantom?.solana ?? window.solflare ?? window.solana;
        if (!provider) throw new Error('No browser wallet was found. Use the Android app, install Phantom or Solflare, or try the demo wallet.');
        const result = await provider.connect();
        wallet = result.publicKey.toBase58();
        setBrowserWallet(provider);
        sign = async message => {
          const result = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
          return toBase64(result instanceof Uint8Array ? result : result.signature);
        };
      }
      const challenge = await api<Challenge>('/auth/challenge', { method: 'POST', body: JSON.stringify({ wallet }) });
      const signature = await sign(challenge.message);
      const auth = await api<AuthSession>('/auth/verify', { method: 'POST', body: JSON.stringify({ wallet, nonce: challenge.nonce, signature }) });
      setSession(auth);
    } finally { setBusy(false); }
  };

  const startDemo = async () => {
    setBusy(true);
    try {
      let result = demo;
      if (!result || !valid(result.buyer) || !valid(result.scout)) {
        const demoId = demo?.demoId ?? sessionStorage.getItem(demoIdKey);
        result = await api<DemoSessions>('/demo/session', { method: 'POST', body: JSON.stringify({ demoId }) });
        sessionStorage.setItem(demoKey, JSON.stringify(result));
        sessionStorage.setItem(demoIdKey, result.demoId);
        setDemo(result);
      }
      setSession(result.buyer);
    } finally { setBusy(false); }
  };

  const setDemoRole = (role: 'buyer' | 'scout') => { if (demo) setSession(demo[role]); };
  const disconnect = () => { setSession(null); setBalance(null); void browserWallet?.disconnect?.(); if (isNative()) void nativeCall('disconnect').catch(() => undefined); };

  const signMessage = async (message: string) => {
    if (!session) throw new Error('Connect your wallet first.');
    if (session.isDemo) return (await api<{ signature: string }>('/demo/sign-message', { method: 'POST', body: JSON.stringify({ message }) }, session)).signature;
    if (isNative()) return nativeCall<string>('signMessage', { message });
    const provider = browserWallet ?? window.phantom?.solana ?? window.solflare ?? window.solana;
    if (!provider) throw new Error('Reconnect your wallet to sign this report.');
    const signature = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
    return toBase64(signature instanceof Uint8Array ? signature : signature.signature);
  };

  const send = async (prepared: PreparedTransaction) => {
    if (!session || !config) throw new Error('Connect your wallet first.');
    if (session.isDemo) return (await api<{ signature: string }>('/demo/sign', {
      method: 'POST', body: JSON.stringify({ preparedId: prepared.preparedId }),
    }, session)).signature;
    if (isNative()) return nativeCall<string>('sendTransaction', { transaction: prepared.transaction, minContextSlot: prepared.minContextSlot });
    const provider = browserWallet ?? window.phantom?.solana ?? window.solflare ?? window.solana;
    if (!provider) throw new Error('Reconnect your wallet to approve this transaction.');
    const { Connection, Transaction } = await import('@solana/web3.js');
    const connection = new Connection(config.rpcUrl, 'confirmed');
    const transaction = Transaction.from(Buffer.from(prepared.transaction, 'base64'));
    const signed = await provider.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    await connection.confirmTransaction({ signature, blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight }, 'confirmed');
    return signature;
  };

  const faucet = async () => {
    if (!session) throw new Error('Connect your wallet first.');
    setBusy(true);
    try { await api('/wallet/faucet', { method: 'POST', body: '{}' }, session); await refreshBalance(); }
    finally { setBusy(false); }
  };

  return <WalletContext.Provider value={{ config, session, demo, busy, balance, connect, startDemo, setDemoRole, disconnect, signMessage, send, refreshBalance, faucet }}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const state = useContext(WalletContext);
  if (!state) throw new Error('WalletProvider is missing.');
  return state;
}
