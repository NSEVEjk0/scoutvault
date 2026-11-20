import { useEffect, useState } from 'react';
import { ArrowRight, Camera, Check, CheckCheck, Clock3, ExternalLink, FileCheck2, MapPin, ShieldCheck, Volume2 } from 'lucide-react';
import type { Bounty } from '../../shared/types';
import { api, dateText, getBounty, prepare, rewardText, shortAddress, transactionUrl } from '../lib/api';
import { speakBrief, stopSpeech } from '../lib/speech';
import { canonicalJson, fromBase64, sha256 } from '../../shared/canonical';
import { useWallet } from '../lib/wallet';
import { CaptureReport } from './CaptureReport';
import { Button, Sheet, Spinner } from './ui';

const statusCopy = { open: 'Open for a scout', claimed: 'Scout checking the place', submitted: 'Report ready to review', paid: 'Bounty paid', cancelled: 'Bounty refunded', disputed: 'In review' };

export function BountyDetail({ id, open, onClose, onChanged, onConnect, notify }: {
  id: string | null; open: boolean; onClose: () => void; onChanged: () => void; onConnect: () => void; notify: (message: string) => void;
}) {
  const wallet = useWallet();
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [confirm, setConfirm] = useState<'approve' | 'refund' | 'dispute' | null>(null);
  const [reason, setReason] = useState('');
  const [verifiedPhoto, setVerifiedPhoto] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<'checking' | 'valid' | 'failed'>('checking');

  const refresh = async () => {
    if (!id) return;
    setLoading(true); setError('');
    try { setBounty(await getBounty(id, wallet.session)); }
    catch (error) { setError(error instanceof Error ? error.message : 'The check could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) void refresh(); return () => stopSpeech(); }, [id, open, wallet.session?.wallet]);
  useEffect(() => {
    const report = bounty?.report;
    setVerifiedPhoto(null); setIntegrity('checking');
    if (!report?.photoUrl || !report.manifest || !wallet.session) return;
    let cancelled = false; let objectUrl: string | null = null;
    void (async () => {
      try {
        const response = await fetch(report.photoUrl!, { headers: { Authorization: `Bearer ${wallet.session!.token}` } });
        if (!response.ok) throw new Error('The private photo could not be read.');
        const blob = await response.blob();
        if (await sha256(new Uint8Array(await blob.arrayBuffer())) !== report.photoHash) throw new Error('The photo does not match the signed hash.');
        const message = canonicalJson(report.manifest);
        if (await sha256(message) !== report.manifestHash) throw new Error('The report metadata does not match its hash.');
        const [{ default: nacl }, { default: bs58 }] = await Promise.all([import('tweetnacl'), import('bs58')]);
        if (!nacl.sign.detached.verify(new TextEncoder().encode(message), fromBase64(report.walletSignature), bs58.decode(report.scoutWallet))) throw new Error('The wallet signature does not match the report.');
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) { setVerifiedPhoto(objectUrl); setIntegrity('valid'); }
        else URL.revokeObjectURL(objectUrl);
      } catch (error) { if (!cancelled) { setIntegrity('failed'); setError(error instanceof Error ? error.message : 'The report integrity check failed.'); } }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [bounty?.report?.id, bounty?.report?.manifestHash, wallet.session?.wallet]);

  const action = async (name: 'claim' | 'approve' | 'refund' | 'dispute') => {
    if (!wallet.session) { onConnect(); return; }
    if (!bounty) return;
    setBusy(name); setError('');
    try {
      const prepared = await prepare(`/bounties/${bounty.id}/${name}`, name === 'dispute' ? { reason } : name === 'approve' ? { expectedManifestHash: bounty.report?.manifestHash } : {}, wallet.session);
      const signature = await wallet.send(prepared);
      const result = await api<Bounty>(`/bounties/${bounty.id}/confirm`, { method: 'POST', body: JSON.stringify({ preparedId: prepared.preparedId, signature }) }, wallet.session);
      setBounty(result); setConfirm(null); onChanged(); await wallet.refreshBalance();
      notify(name === 'claim' ? 'Check claimed. The entrance address is now available.' : name === 'approve' ? 'Payout confirmed. The scout received the bounty.' : name === 'refund' ? 'Refund confirmed.' : 'Dispute recorded. The bounty remains in escrow.');
    } catch (error) { setError(error instanceof Error ? error.message : 'The transaction could not be confirmed.'); }
    finally { setBusy(''); }
  };

  const buyer = bounty?.buyerWallet === wallet.session?.wallet;
  const scout = bounty?.scoutWallet === wallet.session?.wallet;

  return <>
    <Sheet open={open && !captureOpen} onOpenChange={value => { if (!value && !busy) onClose(); }} title={bounty?.title ?? 'Check details'} description={bounty ? `${bounty.area} · ${statusCopy[bounty.status]}` : 'A funded check and its report.'} wide>
      <div className="dialog-body bounty-detail">
        {loading && !bounty ? <Spinner label="Loading check…" /> : bounty && <>
          <div className="detail-meta"><span className={`status-badge status-${bounty.status}`}><span />{statusCopy[bounty.status]}</span><span className="detail-reward">{rewardText(bounty.reward)} <small>{bounty.tokenSymbol}</small></span></div>
          {bounty.isDemo && <p className="inline-notice">Demo check · sample listing and test tokens. This is not an actual paid job.</p>}
          <div className="detail-address"><MapPin size={18} aria-hidden /><div><strong>{bounty.address ?? bounty.area}</strong><p>{bounty.address ? 'Entrance location shared with the participants.' : 'The entrance address is shared after you claim the check.'}</p></div></div>
          <p className="muted">{bounty.description || 'Check the listing in person and send a short report with a fresh camera capture.'}</p>
          <div className="field-heading"><h3>What to check</h3><Button variant="ghost" className="small-button" onClick={() => void speakBrief(bounty.checklist.map((check, index) => `Check ${index + 1}. ${check.question}. ${check.hint}`).join(' ')).catch(error => notify(error.message))}><Volume2 size={16} aria-hidden />Play brief</Button></div>
          <ol className="detail-checks">{bounty.checklist.map((item, index) => <li key={item.id}><span className="check-number">{index + 1}</span><div><strong>{item.question}</strong><p>{item.hint}</p></div></li>)}</ol>
          <div className="source-receipt"><FileCheck2 size={18} aria-hidden /><div><strong>{bounty.baseline.provider === 'firecrawl' ? 'Digital baseline captured' : 'Requester-written checklist'}</strong><a href={bounty.baseline.url} target="_blank" rel="noreferrer">Original listing <ExternalLink size={12} aria-hidden /></a></div><span>{dateText(bounty.baseline.capturedAt)}</span></div>
          {bounty.report && <section className="report-review"><div className="field-heading"><h3>Field report</h3><span className="receipt-label"><ShieldCheck size={14} aria-hidden />Wallet signed</span></div>
            {verifiedPhoto ? <figure><img src={verifiedPhoto} alt="Photo submitted with this field report" width={1200} height={800} /><figcaption>{bounty.report.captureSource === 'demo-sample' ? 'Sample illustration. No site visit is claimed.' : 'Photo submitted by the scout. Review it alongside the observations.'}</figcaption></figure> : <p className="small muted">{integrity === 'failed' ? 'The photo could not be verified. Retry before approving payment.' : 'Checking the photo and wallet signature…'}</p>}
            {integrity === 'valid' && <p className="receipt-label"><ShieldCheck size={14} aria-hidden />Photo hash and wallet signature match</p>}
            <div className="report-results">{bounty.checklist.map(check => <div key={check.id}><span>{check.question}</span><strong className={bounty.report!.answers[check.id] === 'yes' ? 'result-yes' : 'result-unclear'}>{bounty.report!.answers[check.id] === 'yes' ? <><Check size={14} aria-hidden />Yes</> : bounty.report!.answers[check.id] === 'no' ? 'No' : 'Could not confirm'}</strong></div>)}</div>
            {bounty.report.note && <blockquote>{bounty.report.note}</blockquote>}
            <p className="small muted">Submitted {dateText(bounty.report.submittedAt)} by {shortAddress(bounty.report.scoutWallet)}. A signature binds the report to this wallet. It does not certify the camera or GPS.</p>
            <a className="text-link" href={transactionUrl(bounty.report.chainSignature)} target="_blank" rel="noreferrer">View report confirmation <ExternalLink size={14} aria-hidden /></a>
          </section>}
          {bounty.payoutSignature && <section className="payout-receipt"><CheckCheck size={26} aria-hidden /><div><strong>{rewardText(bounty.reward)} {bounty.tokenSymbol} paid</strong><p>The buyer approved the report and the program released the bounty.</p><a href={transactionUrl(bounty.payoutSignature)} target="_blank" rel="noreferrer">View payout on Solana Explorer <ExternalLink size={13} aria-hidden /></a></div></section>}
          <div className="escrow-links"><a href={transactionUrl(bounty.fundingSignature)} target="_blank" rel="noreferrer"><ShieldCheck size={15} aria-hidden />Funding confirmation <ExternalLink size={12} aria-hidden /></a><span><Clock3 size={14} aria-hidden />{bounty.status === 'open' || bounty.status === 'claimed' ? `Expires ${dateText(bounty.expiresAt)}` : dateText(bounty.createdAt)}</span></div>
          {error && <p className="field-error" role="alert">{error}</p>}
          {confirm ? <div className="action-confirm"><h3>{confirm === 'approve' ? `Release ${rewardText(bounty.reward)} ${bounty.tokenSymbol}?` : confirm === 'refund' ? 'Refund this bounty?' : 'Ask for a dispute review?'}</h3><p className="muted">{confirm === 'approve' ? 'Check the photos and answers first. After confirmation, the transfer cannot be undone.' : confirm === 'refund' ? 'The held tokens return to the buyer and the check closes.' : 'The bounty stays locked while the recorded review wallet resolves the dispute.'}</p>{confirm === 'dispute' && <><label htmlFor="dispute-reason">What needs review?</label><textarea id="dispute-reason" name="dispute-reason" rows={3} value={reason} maxLength={1200} onChange={event => setReason(event.target.value)} /></>}<div className="dialog-actions"><Button variant="ghost" onClick={() => setConfirm(null)} disabled={!!busy}>Keep reviewing</Button><Button variant={confirm === 'approve' ? 'primary' : 'danger'} onClick={() => void action(confirm)} disabled={!!busy || (confirm === 'dispute' && reason.trim().length < 10)}>{busy ? <Spinner label="Confirming…" /> : confirm === 'approve' ? 'Approve and pay scout' : confirm === 'refund' ? 'Confirm refund' : 'Record dispute'}</Button></div></div> : <div className="detail-actions">
            {bounty.status === 'open' && !buyer && <Button onClick={() => void action('claim')} disabled={!!busy}>{busy ? <Spinner label="Claiming check…" /> : <>Claim this check <ArrowRight size={17} aria-hidden /></>}</Button>}
            {bounty.status === 'open' && buyer && <Button variant="secondary" onClick={() => setConfirm('refund')}>Cancel and refund</Button>}
            {(bounty.status === 'claimed' || bounty.status === 'submitted') && scout && <Button onClick={() => setCaptureOpen(true)} disabled={!!busy}><Camera size={17} aria-hidden />{bounty.status === 'submitted' ? 'Send an updated report' : 'Capture field report'}</Button>}
            {bounty.status === 'claimed' && buyer && <p className="waiting-note">Your scout is checking the place. The reward remains in escrow.</p>}
            {bounty.status === 'submitted' && buyer && <><Button onClick={() => setConfirm('approve')} disabled={!bounty.report || integrity !== 'valid'}><CheckCheck size={17} aria-hidden />Review and pay scout</Button><Button variant="ghost" onClick={() => setConfirm('dispute')}>Request dispute review</Button></>}
            {bounty.status === 'submitted' && scout && <p className="waiting-note">Your report is ready. Payment follows the buyer’s review.</p>}
            {bounty.status === 'claimed' && buyer && new Date(bounty.expiresAt).getTime() < Date.now() && <Button variant="secondary" onClick={() => setConfirm('refund')}>Refund expired check</Button>}
          </div>}
        </>}
        {error && !bounty && <><p className="field-error" role="alert">{error}</p><Button variant="secondary" onClick={() => void refresh()}>Retry</Button></>}
      </div>
    </Sheet>
    {bounty && <CaptureReport bounty={bounty} open={captureOpen} onClose={() => setCaptureOpen(false)} onSubmitted={value => { setBounty(value); onChanged(); }} notify={notify} />}
  </>;
}
