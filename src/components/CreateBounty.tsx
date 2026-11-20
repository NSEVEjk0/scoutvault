import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleDollarSign, ExternalLink, Link2, LocateFixed, ShieldCheck } from 'lucide-react';
import type { Bounty, ListingBaseline } from '../../shared/types';
import { canonicalJson, sha256 } from '../../shared/canonical';
import { api, prepare, readListing, rewardText, type PreparedTransaction } from '../lib/api';
import { currentLocation } from '../lib/native';
import { useWallet } from '../lib/wallet';
import { AKOKA, ScoutMap } from './Map';
import { Button, Field, Sheet, Spinner } from './ui';

export function CreateBounty({ open, onClose, onCreated, onConnect, notify }: {
  open: boolean; onClose: () => void; onCreated: (bounty: Bounty) => void; onConnect: () => void; notify: (message: string) => void;
}) {
  const wallet = useWallet();
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState('');
  const [baseline, setBaseline] = useState<ListingBaseline | null>(null);
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('Akoka, Lagos');
  const [category, setCategory] = useState<'housing' | 'shop' | 'campus'>('housing');
  const [point, setPoint] = useState(AKOKA);
  const [reward, setReward] = useState('2');
  const [hours, setHours] = useState('24');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prepared, setPrepared] = useState<PreparedTransaction | null>(null);

  useEffect(() => {
    if (open && !baseline) setUrl(`${location.origin}/listings/akoka-studio.html`);
    if (!open) { setStep(0); setBaseline(null); setPrepared(null); setError(''); }
  }, [open]);

  const scrape = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await readListing(url);
      setBaseline(result); setTitle(result.title); setAddress(result.address); setStep(1);
    } catch (error) { setError(error instanceof Error ? error.message : 'The listing could not be read. Try another link, or write the checks yourself.'); }
    finally { setBusy(false); }
  };

  const manual = async () => {
    const checklist = [
      { id: 'address', question: 'Is the place at the advertised address?', sourceClaim: 'Address to be supplied by the requester.', hint: 'Photograph the entrance and check the street name.' },
      { id: 'price', question: 'Does the price match the listing?', sourceClaim: 'Price to be confirmed with the seller.', hint: 'Ask the seller what is included in the price.' },
      { id: 'detail', question: 'Is the advertised amenity present?', sourceClaim: 'Edit this check to name the amenity.', hint: 'Name the thing you need the scout to inspect.' },
    ];
    const value = { url, title: 'Check an off-campus listing', description: '', address: '', price: '', checklist, capturedAt: new Date().toISOString(), provider: 'manual' as const, warnings: ['You are writing these checks. They have not been extracted from the page.'] };
    const result = { ...value, sourceHash: await sha256(canonicalJson(value)) };
    setBaseline(result); setTitle(result.title); setStep(1); setError('');
  };

  const prepareFunding = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!wallet.config?.settlementReady) { setError('Test payments are being set up. Your checklist is ready to review.'); return; }
    if (!wallet.session) { onConnect(); return; }
    if (!baseline || !address.trim() || !title.trim()) { setError('Add a title and the entrance address so the scout knows what to check.'); return; }
    if (!baseline.checklist.every(check => check.question.trim().length >= 8)) { setError('Write a clear question for every check.'); return; }
    setBusy(true);
    try {
      const result = await prepare('/bounties/prepare', {
        baseline, title, address, area, category, latitude: point.latitude, longitude: point.longitude,
        reward, expiresAt: new Date(Date.now() + Number(hours) * 3600000).toISOString(),
      }, wallet.session);
      setPrepared(result); setStep(2);
    } catch (error) { setError(error instanceof Error ? error.message : 'The bounty could not be prepared. Please try again.'); }
    finally { setBusy(false); }
  };

  const fund = async () => {
    if (!wallet.session || !prepared) return;
    setBusy(true); setError('');
    try {
      const signature = await wallet.send(prepared);
      const bounty = await api<Bounty>(`/bounties/${prepared.id}/confirm`, {
        method: 'POST', body: JSON.stringify({ preparedId: prepared.preparedId, signature }),
      }, wallet.session);
      await wallet.refreshBalance();
      notify('Bounty funded. A scout can now claim the check.'); onCreated(bounty); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : 'Funding could not be confirmed. Check your wallet before trying again.'); }
    finally { setBusy(false); }
  };

  return <Sheet open={open} onOpenChange={value => { if (!value && !busy) onClose(); }} title="Create a check" description="Turn a listing into a few things someone can inspect." wide>
    <div className="step-tabs" aria-label="Create bounty progress">{['Read listing', 'Choose checks', 'Fund bounty'].map((name, index) => <span className={index === step ? 'step-active' : ''} key={name}><span>{index < step ? <Check size={13} aria-hidden /> : index + 1}</span>{name}</span>)}</div>
    {step === 0 && <form onSubmit={scrape} className="dialog-body">
      <div className="intro-icon"><Link2 size={25} aria-hidden /></div>
      <h3>Start with the listing link.</h3>
      <p className="muted">ScoutVault reads the page and suggests a short checklist. Review each question before you fund it.</p>
      <Field label="Listing URL" id="listing-url" hint="A public rental, shop, or campus page. The sample link is labelled as a demo." error={error}>
        <input id="listing-url" name="listing-url" type="url" autoComplete="off" placeholder="https://example.com/listing…" required value={url} onChange={event => setUrl(event.target.value)} />
      </Field>
      <Button type="submit" disabled={busy}>{busy ? <Spinner label="Reading the listing…" /> : <>Read listing <ArrowRight size={17} aria-hidden /></>}</Button>
      <Button variant="ghost" type="button" onClick={() => void manual()} disabled={busy}>Write the checks yourself</Button>
      <p className="small muted">Only the public URL goes to the listing reader. Your wallet and private notes are not sent with it.</p>
    </form>}
    {step === 1 && baseline && <form onSubmit={prepareFunding} className="dialog-body">
      <div className="source-receipt"><span className="receipt-dot" /><div><strong>{baseline.provider === 'firecrawl' ? 'Listing read with Firecrawl' : 'Requester-written checks'}</strong><a href={baseline.url} target="_blank" rel="noreferrer">View source <ExternalLink size={12} aria-hidden /></a></div></div>
      {baseline.warnings.length > 0 && <p className="inline-notice">{baseline.warnings[0]}</p>}
      <Field label="Check title" id="bounty-title"><input id="bounty-title" name="bounty-title" autoComplete="off" maxLength={100} required value={title} onChange={event => setTitle(event.target.value)} /></Field>
      <div className="field"><label>What should the scout check?</label><div className="edit-checks">{baseline.checklist.map((item, index) => <div className="edit-check" key={item.id}><span className="check-number">{index + 1}</span><div><label htmlFor={`check-${item.id}`} className="sr-only">Check {index + 1}</label><input id={`check-${item.id}`} name={`check-${item.id}`} autoComplete="off" maxLength={180} required value={item.question} onChange={event => setBaseline({ ...baseline, checklist: baseline.checklist.map(check => check.id === item.id ? { ...check, question: event.target.value } : check) })} /><p>{item.sourceClaim}</p></div></div>)}</div></div>
      <div className="form-columns"><Field label="Entrance address" id="bounty-address"><input id="bounty-address" name="bounty-address" autoComplete="street-address" value={address} required maxLength={180} onChange={event => setAddress(event.target.value)} placeholder="Street and entrance landmark…" /></Field><Field label="Neighbourhood" id="bounty-area"><input id="bounty-area" name="bounty-area" autoComplete="address-level2" required value={area} maxLength={80} onChange={event => setArea(event.target.value)} /></Field></div>
      <div className="field"><div className="field-heading"><label>Place the pin at the entrance</label><Button variant="ghost" type="button" className="small-button" onClick={() => void currentLocation().then(setPoint).catch(error => notify(error.message))}><LocateFixed size={15} aria-hidden />Use my location</Button></div><ScoutMap bounties={[]} center={point} onPick={setPoint} small /><p className="field-hint">Tap the entrance on the map. The public feed shows an approximate location.</p></div>
      <div className="form-columns three-columns"><Field label="Category" id="bounty-category"><select id="bounty-category" name="bounty-category" value={category} onChange={event => setCategory(event.target.value as typeof category)}><option value="housing">Housing</option><option value="shop">Shop or vendor</option><option value="campus">Campus claim</option></select></Field><Field label="Bounty (TEST USDC)" id="bounty-reward"><input id="bounty-reward" name="bounty-reward" type="number" inputMode="decimal" min="0.5" max="25" step="0.5" required value={reward} onChange={event => setReward(event.target.value)} /></Field><Field label="Check expires in" id="bounty-expiry"><select id="bounty-expiry" name="bounty-expiry" value={hours} onChange={event => setHours(event.target.value)}><option value="1">1 hour</option><option value="6">6 hours</option><option value="24">24 hours</option><option value="48">48 hours</option></select></Field></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="dialog-actions"><Button variant="ghost" type="button" onClick={() => setStep(0)} disabled={busy}><ArrowLeft size={16} aria-hidden />Back</Button><Button type="submit" disabled={busy}>{busy ? <Spinner label="Preparing bounty…" /> : <>Review funding <ArrowRight size={17} aria-hidden /></>}</Button></div>
    </form>}
    {step === 2 && prepared && <div className="dialog-body">
      <div className="intro-icon"><CircleDollarSign size={26} aria-hidden /></div><h3>Hold the reward until you review.</h3><p className="muted">The token program holds the bounty. You release it after checking the scout’s signed report.</p>
      <div className="funding-summary"><div><span>Bounty</span><strong>{rewardText(reward)} <small>TEST USDC</small></strong></div><div><span>Network fee estimate</span><span>{(prepared.estimatedFeeSol ?? 0.000005).toFixed(6)} SOL</span></div><div><span>Account rent estimate</span><span>{(prepared.estimatedRentSol ?? 0.006).toFixed(6)} SOL</span></div><p>Escrow and vault rent return when the bounty closes. A first-time wallet may also need a token account and buyer record.</p></div>
      <div className="review-note"><ShieldCheck size={18} aria-hidden /><p>You approve payment. Unclaimed checks can be cancelled. Expired unfinished checks can be refunded. Disputes go to the review wallet listed in the escrow.</p></div>
      <p className="inline-notice">{wallet.config?.network === 'localnet' ? 'Local Solana validator' : 'Solana devnet'} · TEST USDC has no cash value. The title and checklist are public. The exact pin and report photos stay with the participants.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="dialog-actions"><Button variant="ghost" onClick={() => setStep(1)} disabled={busy}><ArrowLeft size={16} aria-hidden />Edit checks</Button><Button onClick={() => void fund()} disabled={busy}>{busy ? <Spinner label="Confirming funding…" /> : <>Fund {rewardText(reward)} TEST USDC <ArrowRight size={17} aria-hidden /></>}</Button></div>
    </div>}
  </Sheet>;
}
