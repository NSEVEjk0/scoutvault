import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createClient } from '@supabase/supabase-js';
import { ArrowDownLeft, ArrowRight, Bell, Building2, Check, CheckCheck, ChevronDown, CircleHelp, Compass, Download, ExternalLink, FileCheck2, LocateFixed, MapPin, Plus, Search, ShieldCheck, ShoppingBag, Sparkle, Wallet, X } from 'lucide-react';
import type { Bounty, PublicConfig } from '../shared/types';
import { api, dateText, getBounties, getConfig, rewardText, shortAddress, transactionUrl } from './lib/api';
import { currentLocation, isNative } from './lib/native';
import { WalletProvider, useWallet } from './lib/wallet';
import { AKOKA, ScoutMap } from './components/Map';
import { BountyDetail } from './components/BountyDetail';
import { CreateBounty } from './components/CreateBounty';
import { Button, Sheet, Spinner } from './components/ui';

const readRoute = () => { const params = new URLSearchParams(location.search); return { view: params.get('view') ?? 'map', bounty: params.get('bounty') }; };
const categories = [{ id: 'all', label: 'All checks', icon: Compass }, { id: 'housing', label: 'Housing', icon: Building2 }, { id: 'shop', label: 'Shops', icon: ShoppingBag }, { id: 'campus', label: 'Campus', icon: MapPin }];
const readFilters = () => { const params = new URLSearchParams(location.search); const category = params.get('category') ?? 'all'; return { category: categories.some(item => item.id === category) ? category : 'all', search: params.get('q')?.slice(0, 160) ?? '' }; };
const viewHref = (view: string, bounty: string | null = null) => { const query = new URLSearchParams(location.search); query.delete('view'); query.delete('bounty'); if (view !== 'map') query.set('view', view); if (bounty) query.set('bounty', bounty); return `${location.pathname}${query.size ? `?${query}` : ''}`; };
const statusNames = { open: 'Open check', claimed: 'In progress', submitted: 'Report ready', paid: 'Paid', cancelled: 'Refunded', disputed: 'In review' };

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => { setError(''); try { setConfig(await getConfig()); } catch { setError('ScoutVault could not connect. Please retry in a moment.'); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <WalletProvider config={config}><Workspace config={config} connectionError={error} onRetry={() => void load()} /></WalletProvider>;
}

function Workspace({ config, connectionError, onRetry }: { config: PublicConfig | null; connectionError: string; onRetry: () => void }) {
  const wallet = useWallet();
  const [route, setRoute] = useState(readRoute);
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [paidCount, setPaidCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [category, setCategory] = useState(() => readFilters().category);
  const [search, setSearch] = useState(() => readFilters().search);
  const [point, setPoint] = useState(AKOKA);
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [locating, setLocating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [toast, setToast] = useState('');
  const [refreshId, setRefreshId] = useState(0);

  const navigate = (view: string, bounty: string | null = null) => {
    history.pushState(null, '', viewHref(view, bounty)); setRoute({ view, bounty });
  };
  const updateFilters = (nextCategory: string, nextSearch: string) => {
    const query = new URLSearchParams(location.search);
    if (nextCategory === 'all') query.delete('category'); else query.set('category', nextCategory);
    if (!nextSearch) query.delete('q'); else query.set('q', nextSearch);
    history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
    setCategory(nextCategory); setSearch(nextSearch);
  };
  useEffect(() => { const update = () => { const filters = readFilters(); setRoute(readRoute()); setCategory(filters.category); setSearch(filters.search); }; window.addEventListener('popstate', update); return () => window.removeEventListener('popstate', update); }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key !== '/' || createOpen || walletOpen || route.bounty || route.view === 'guide' || (event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)))) return;
      event.preventDefault(); document.querySelector<HTMLInputElement>('input[name="check-search"]')?.focus();
    };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, [createOpen, walletOpen, route.bounty, route.view]);
  const notify = useCallback((message: string) => { setToast(message); }, []);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), 6000); return () => clearTimeout(timeout); }, [toast]);

  const refresh = useCallback(async () => {
    if (!config) return;
    try {
      const data = await getBounties(wallet.session, nearbyOnly ? point.latitude : undefined, nearbyOnly ? point.longitude : undefined);
      setBounties(data.bounties); setPaidCount(data.paidCount); setFeedError('');
    } catch (error) { setFeedError(error instanceof Error ? error.message : 'The checks could not be loaded.'); }
    finally { setLoading(false); }
  }, [config, wallet.session, point.latitude, point.longitude, nearbyOnly]);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 15000); return () => clearInterval(timer); }, [refresh, refreshId]);

  useEffect(() => {
    if (!config?.supabaseUrl || !config.supabaseAnonKey) return;
    const client = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, accessToken: async () => wallet.session?.token ?? config.supabaseAnonKey });
    const channel = client.channel('scoutvault-map').on('postgres_changes', { event: '*', schema: 'public', table: 'public_bounties' }, () => void refresh()).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [config?.supabaseUrl, config?.supabaseAnonKey, wallet.session?.token, refresh]);

  const useLocation = async () => {
    setLocating(true);
    try { const location = await currentLocation(); setPoint(location); setNearbyOnly(true); notify('Showing checks within 2 km of your location.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Your location could not be read.'); }
    finally { setLocating(false); }
  };

  const connect = async (demo: boolean) => {
    setWalletError('');
    try { await (demo ? wallet.startDemo() : wallet.connect()); setWalletOpen(false); notify(demo ? 'Demo buyer connected. Your tokens have no cash value.' : 'Wallet connected. You can now fund or claim a check.'); }
    catch (error) { setWalletError(error instanceof Error ? error.message : 'The wallet could not connect.'); }
  };

  const filtered = bounties.filter(bounty => {
    if (route.view === 'requests' && bounty.buyerWallet !== wallet.session?.wallet) return false;
    if (route.view === 'scouting' && bounty.scoutWallet !== wallet.session?.wallet) return false;
    if (category !== 'all' && bounty.category !== category) return false;
    return `${bounty.title} ${bounty.area}`.toLowerCase().includes(search.toLowerCase());
  });
  const openCount = bounties.filter(bounty => bounty.status === 'open').length;
  const viewName = route.view === 'requests' ? 'My requests' : route.view === 'scouting' ? 'My field checks' : 'Scout map';

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to checks</a>
    <header className="topbar"><a className="brand" href={new URLSearchParams(location.search).get('demo') === 'local' ? '/?demo=local' : '/'}><img src="/scoutvault.svg" alt="" width={34} height={34} /><span translate="no">ScoutVault</span><span className="brand-divider" /><span className="brand-caption">Check before you pay</span></a><nav className="desktop-nav" aria-label="Main navigation">{[{ id: 'map', label: 'Scout map' }, { id: 'requests', label: 'My requests' }, { id: 'scouting', label: 'Field checks' }].map(tab => <a className={route.view === tab.id ? 'nav-link nav-active' : 'nav-link'} key={tab.id} href={viewHref(tab.id)} onClick={event => { event.preventDefault(); navigate(tab.id); }}>{route.view === tab.id && <motion.span className="nav-selection" layoutId="nav-selection" transition={{ type: 'spring', stiffness: 400, damping: 35, mass: 0.7 }} />}{tab.label}</a>)}</nav><div className="topbar-actions"><span className="network-tag"><span />{config?.network === 'localnet' ? 'Local testnet' : 'Devnet'}</span><Button variant="secondary" className="wallet-button" onClick={() => { setWalletError(''); setWalletOpen(true); }}><Wallet size={16} aria-hidden />{wallet.session ? shortAddress(wallet.session.wallet) : 'Connect wallet'}{wallet.session && <ChevronDown size={13} aria-hidden />}</Button></div></header>
    {config?.network === 'localnet' && <div className="demo-toolbar" role="region" aria-label="Demo network"><span>Local Solana demo · test tokens · sample reports</span><a href="/">Switch to devnet</a></div>}
    {wallet.session?.isDemo && wallet.demo && <div className="demo-toolbar" role="region" aria-label="Demo wallets"><span><Sparkle size={14} aria-hidden />Demo wallet · test tokens only</span><div className="role-tabs" aria-label="Demo wallet role">{(['buyer', 'scout'] as const).map(role => <button key={role} className={wallet.session?.wallet === wallet.demo?.[role].wallet ? 'role-active' : ''} onClick={() => { wallet.setDemoRole(role); notify(`Demo ${role} connected.`); }}>{wallet.session?.wallet === wallet.demo?.[role].wallet && <Check size={12} aria-hidden />}{role === 'buyer' ? 'Buyer' : 'Scout'}</button>)}</div></div>}
    <main id="main" className="workspace">
      <section className="hero-row"><div><div className="eyebrow"><span className="eyebrow-line" />A second pair of eyes</div><h1>{route.view === 'requests' ? 'Your checks. Your decision.' : route.view === 'scouting' ? 'A short check. A clear report.' : 'Check the place before you pay.'}</h1><p>{route.view === 'requests' ? 'Follow your funded requests, read the field reports, and release payment when you approve.' : route.view === 'scouting' ? 'See the checks you claimed, capture what you find, and send it to the buyer.' : 'Ask a nearby scout to check a listing. Review their signed report before releasing the bounty.'}</p></div><Button className="create-button" onClick={() => setCreateOpen(true)}><Plus size={17} aria-hidden />Create a check</Button></section>
      <div className="mobile-nav" aria-label="Views">{[{ id: 'map', label: 'Scout map' }, { id: 'requests', label: 'My requests' }, { id: 'scouting', label: 'Field checks' }].map(tab => <button key={tab.id} className={route.view === tab.id ? 'mobile-nav-active' : ''} onClick={() => navigate(tab.id)}>{tab.label}</button>)}</div>
      {config && !config.settlementReady && <div className="connection-notice" role="status"><span>Test payments are being set up. You can read a listing and edit its checklist.</span><a className="button button-secondary small-button" href="/?demo=local">Try the local demo</a><Button variant="ghost" className="small-button" onClick={onRetry}>Check again</Button></div>}
      {(connectionError || feedError) && <div className="connection-notice" role="status"><span>{connectionError || feedError}</span><Button variant="ghost" className="small-button" onClick={() => { onRetry(); void refresh(); }}>Retry</Button></div>}
      <div className="workspace-grid"><section className="checks-panel" aria-labelledby="checks-heading"><div className="panel-heading"><div><h2 id="checks-heading">{viewName}</h2><span>{nearbyOnly ? 'Within 2 km of you' : 'Browse the community feed'}</span></div><span className="count-pill">{filtered.length} {filtered.length === 1 ? 'check' : 'checks'}</span></div><div className="filters">{categories.map(({ id, label, icon: Icon }) => <button key={id} className={category === id ? 'filter filter-active' : 'filter'} onClick={() => updateFilters(id, search)} aria-pressed={category === id}><Icon size={14} aria-hidden />{label}</button>)}</div><label className="search-field"><Search size={16} aria-hidden /><span className="sr-only">Search check titles and places</span><input type="search" name="check-search" autoComplete="off" placeholder="Search a place or check…" value={search} maxLength={160} onChange={event => updateFilters(category, event.target.value)} /><kbd>/</kbd></label>
        <div className="bounty-list" aria-live="polite">{loading && config ? <div className="feed-empty"><Spinner label="Finding checks…" /></div> : filtered.length ? filtered.map(bounty => <BountyCard key={bounty.id} bounty={bounty} onOpen={() => navigate(route.view, bounty.id)} />) : <div className="feed-empty"><div className="empty-icon"><Compass size={25} aria-hidden /></div><h3>{route.view === 'map' ? 'Start with one place.' : !wallet.session ? 'Connect to see your checks.' : 'No checks here yet.'}</h3><p>{route.view === 'map' ? 'Create a short checklist for a listing you want someone nearby to inspect.' : 'Fund a request or claim an open check. Its progress will appear here.'}</p><Button variant="secondary" onClick={() => !wallet.session && route.view !== 'map' ? setWalletOpen(true) : setCreateOpen(true)}>{!wallet.session && route.view !== 'map' ? 'Connect wallet' : 'Create a check'}<ArrowRight size={16} aria-hidden /></Button></div>}</div>
        <div className="feed-note"><ShieldCheck size={15} aria-hidden /><p>Rewards stay in escrow until the buyer approves. A signed report informs your decision; it does not guarantee a listing is safe.</p></div>
      </section>
      <aside className="map-panel"><div className="map-heading"><div><MapPin size={16} aria-hidden /><strong>{nearbyOnly ? 'Around you' : 'Akoka, Lagos'}</strong><span>2 km checks</span></div><Button variant="ghost" className="small-button" onClick={() => void useLocation()} disabled={locating}>{locating ? <Spinner label="Locating…" /> : <><LocateFixed size={14} aria-hidden />Use my location</>}</Button></div><div className="map-frame"><ScoutMap bounties={filtered} center={point} onSelect={id => navigate(route.view, id)} selectedId={route.bounty} /><div className="map-caption"><span className="map-caption-dot" />Public pins are approximate.</div></div><div className="map-stats"><div><strong>{openCount}</strong><span>Open checks</span></div><div><strong>{paidCount}</strong><span>Confirmed payouts</span></div><div><strong>2 km</strong><span>Nearby search radius</span></div></div><section className="how-card"><span className="eyebrow">A check, from start to finish</span><h3>Three steps. One clear report.</h3><ol><li><span>01</span><div><strong>Choose what matters.</strong><p>Read the listing and fund a short checklist.</p></div></li><li><span>02</span><div><strong>Get a fresh field report.</strong><p>A scout captures a photo and signs their observations.</p></div></li><li><span>03</span><div><strong>Review before you release.</strong><p>Approve the report to pay the scout through Solana.</p></div></li></ol><button className="how-link" onClick={() => navigate('guide')}>How the report and escrow work <ArrowRight size={15} aria-hidden /></button></section></aside></div>
      <footer className="workspace-footer"><span>ScoutVault · A field check before a bigger decision.</span><div><a href={viewHref('guide')} onClick={event => { event.preventDefault(); navigate('guide'); }}>How it works</a><a href="/docs/privacy.html">Privacy</a>{config?.androidDownloadUrl && <a href={config.androidDownloadUrl}><Download size={13} aria-hidden />Android app</a>}<a href="/demo/" target="_blank" rel="noreferrer">Watch the demo <ExternalLink size={12} aria-hidden /></a></div></footer>
    </main>
    <CreateBounty open={createOpen} onClose={() => setCreateOpen(false)} onConnect={() => setWalletOpen(true)} onCreated={bounty => { setRefreshId(value => value + 1); navigate('requests', bounty.id); }} notify={notify} />
    <BountyDetail id={route.bounty} open={!!route.bounty && !createOpen} onClose={() => navigate(route.view)} onChanged={() => setRefreshId(value => value + 1)} onConnect={() => setWalletOpen(true)} notify={notify} />
    <Sheet open={walletOpen} onOpenChange={setWalletOpen} title={wallet.session ? 'Your wallet' : 'Choose how to try ScoutVault'} description={`${config?.network === 'localnet' ? 'Local Solana validator' : 'Solana devnet'}. Test tokens have no cash value.`}>
      <div className="dialog-body wallet-sheet">{wallet.session ? <><div className="wallet-summary"><div className="wallet-avatar"><Wallet size={22} aria-hidden /></div><strong>{shortAddress(wallet.session.wallet)}</strong><span>{wallet.session.isDemo ? 'Demo wallet' : isNative() ? 'Android wallet' : 'Connected wallet'}</span></div><div className="wallet-balances"><div><strong>{wallet.balance ? rewardText(String(wallet.balance.tokens)) : '—'}</strong><span>TEST USDC</span></div><div><strong>{wallet.balance?.sol.toFixed(4) ?? '—'}</strong><span>SOL for network costs</span></div></div><Button variant="secondary" disabled={wallet.busy} onClick={() => void wallet.faucet().then(() => notify('Test tokens added. They have no cash value.')).catch(error => setWalletError(error.message))}><ArrowDownLeft size={16} aria-hidden />{wallet.busy ? 'Adding test tokens…' : 'Get test tokens'}</Button><Button variant="ghost" onClick={() => { wallet.disconnect(); setWalletOpen(false); }}>Disconnect wallet</Button></> : <><button className="wallet-choice" onClick={() => void connect(true)} disabled={wallet.busy || !config?.demoEnabled}><div className="wallet-choice-icon"><Sparkle size={22} aria-hidden /></div><div><strong>Try with test funds</strong><p>{config?.demoEnabled ? 'Use a demo buyer and scout. No wallet install needed.' : 'Test payments are being set up. Preview a listing first.'}</p></div><ArrowRight size={18} aria-hidden /></button><button className="wallet-choice" onClick={() => void connect(false)} disabled={wallet.busy || !config || config.network === 'localnet'}><div className="wallet-choice-icon"><Wallet size={21} aria-hidden /></div><div><strong>{isNative() ? 'Connect your phone wallet' : 'Connect a Solana wallet'}</strong><p>{config?.network === 'localnet' ? 'Phone and browser wallets use devnet mode. This local demo uses test wallets.' : isNative() ? 'Authorize signing through Mobile Wallet Adapter.' : 'Use Phantom, Solflare, or the Android app.'}</p></div><ArrowRight size={18} aria-hidden /></button>{config?.androidDownloadUrl && <a className="wallet-choice" href={config.androidDownloadUrl}><div className="wallet-choice-icon"><Download size={21} aria-hidden /></div><div><strong>Get the Android app</strong><p>Use the phone camera, location, and mobile wallet.</p></div><ArrowRight size={18} aria-hidden /></a>}{wallet.busy && <Spinner label="Connecting and preparing test funds…" />}</>}{walletError && <p className="field-error" role="alert">{walletError}</p>}<p className="small muted">The demo uses sample listings and illustrations. A phone wallet signature protects the signing key. It does not certify your camera or GPS.</p></div>
    </Sheet>
    <Sheet open={route.view === 'guide'} onOpenChange={value => { if (!value) navigate('map'); }} title="Know what a report proves" description="A useful field check, with a clear payment rule.">
      <div className="dialog-body guide-copy"><h3>The listing is a starting point.</h3><p>Firecrawl reads a public page. You choose a few claims a scout can check at the place. A scrape captures what the page said at that time. It does not verify the seller.</p><h3>The scout signs their report.</h3><p>The app asks for a fresh check code, camera capture, observations, and location metadata. The wallet signature binds those bytes to the bounty and signing wallet. It does not prove that GPS is genuine, that a photo has not been fabricated, or that the signer is a verified student.</p><h3>You review before paying.</h3><p>A Solana program holds the tokens. Approving a submitted report pays the assigned scout. You can refund an unclaimed check or an expired check without a report. A dispute keeps the tokens in escrow until the recorded review wallet resolves it.</p><h3>Try it with test tokens.</h3><p>This deployment uses {config?.network === 'localnet' ? 'a local Solana validator' : 'devnet'} and a project-issued TEST USDC token with no cash value. You can inspect the funding, report, and payout transactions in Solana Explorer.</p><Button onClick={() => { navigate('map'); setWalletOpen(true); }}>Try a check <ArrowRight size={17} aria-hidden /></Button></div>
    </Sheet>
    <AnimatePresence>{toast && <motion.div className="toast" role="status" aria-live="polite" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18 }}><Check size={17} aria-hidden /><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} aria-hidden /></button></motion.div>}</AnimatePresence>
  </div>;
}

function BountyCard({ bounty, onOpen }: { bounty: Bounty; onOpen: () => void }) {
  const Icon = bounty.category === 'housing' ? Building2 : bounty.category === 'shop' ? ShoppingBag : Compass;
  const actionLabel = bounty.status === 'submitted' ? 'View report' : bounty.status === 'paid' ? 'View receipt' : 'View check';
  return <article className="bounty-card"><div className="bounty-card-top"><span className="category-label"><Icon size={14} aria-hidden />{bounty.category === 'housing' ? 'Housing' : bounty.category === 'shop' ? 'Shop or vendor' : 'Campus'}</span><span className={`status-badge status-${bounty.status}`}><span />{statusNames[bounty.status]}</span></div><div className="bounty-card-main"><div><h3><button onClick={onOpen}>{bounty.title}</button></h3><p><MapPin size={13} aria-hidden />{bounty.area}{bounty.distanceMeters !== undefined && <span>· {(bounty.distanceMeters / 1000).toFixed(1)} km away</span>}</p></div><div className="card-reward"><strong>{rewardText(bounty.reward)}</strong><span>{bounty.tokenSymbol}</span></div></div><div className="bounty-card-bottom"><span><FileCheck2 size={14} aria-hidden />{bounty.checklist.length} checks</span><span>{bounty.isDemo ? 'Demo listing' : 'Wallet-funded'}</span><button onClick={onOpen} aria-label={`${actionLabel}: ${bounty.title}`}>{actionLabel}<ArrowRight size={15} aria-hidden /></button></div>{bounty.status === 'paid' && bounty.payoutSignature && <a className="card-receipt" href={transactionUrl(bounty.payoutSignature)} target="_blank" rel="noreferrer"><CheckCheck size={13} aria-hidden />Payout confirmed on Solana<ExternalLink size={11} aria-hidden /></a>}</article>;
}
