import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, Check, CheckCheck, LocateFixed, RefreshCcw, ShieldCheck, Volume2 } from 'lucide-react';
import type { Bounty, CaptureChallenge, CheckAnswer } from '../../shared/types';
import { canonicalJson, fromBase64, sha256 } from '../../shared/canonical';
import { api, prepare } from '../lib/api';
import { currentLocation, isNative, nativeCall } from '../lib/native';
import { speakBrief, stopSpeech } from '../lib/speech';
import { useWallet } from '../lib/wallet';
import { Button, Field, Sheet, Spinner } from './ui';

export function CaptureReport({ bounty, open, onClose, onSubmitted, notify }: {
  bounty: Bounty; open: boolean; onClose: () => void; onSubmitted: (bounty: Bounty) => void; notify: (message: string) => void;
}) {
  const wallet = useWallet();
  const [challenge, setChallenge] = useState<CaptureChallenge | null>(null);
  const [answers, setAnswers] = useState<Record<string, CheckAnswer>>({});
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [point, setPoint] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [captureSource, setCaptureSource] = useState<'android-camera' | 'web-camera' | 'demo-sample'>('web-camera');
  const [capturedAt, setCapturedAt] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (open && wallet.session) void api<CaptureChallenge>(`/bounties/${bounty.id}/challenge`, {}, wallet.session).then(setChallenge).catch(error => setError(error.message));
    return () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; stopSpeech(); };
  }, [open, bounty.id]);
  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [photo]);

  const openCamera = async () => {
    setError('');
    try {
      if (isNative()) {
        const result = await nativeCall<{ base64: string; latitude: number; longitude: number; accuracy: number; capturedAt: string }>('capture', { instruction: challenge?.instruction, code: challenge?.code });
        setPhoto(new Blob([new Uint8Array(fromBase64(result.base64))], { type: 'image/jpeg' }));
        setPoint(result); setCapturedAt(result.capturedAt); setCaptureSource('android-camera');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera capture needs HTTPS and a supported browser. Open ScoutVault on your phone.');
      const coordinates = await currentLocation(); setPoint(coordinates);
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      stream.current = media; setCameraReady(true);
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = media; void video.current.play(); } });
    } catch (error) { setError(error instanceof Error ? error.message : 'Camera access was denied. Allow camera access, then try again.'); }
  };

  const takePhoto = async () => {
    if (!video.current || !cameraReady) return;
    setBusy(true); setError('');
    try {
      const coordinates = await currentLocation(); setPoint(coordinates);
      const canvas = document.createElement('canvas');
      canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
      canvas.getContext('2d')!.drawImage(video.current, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The camera image could not be saved. Try again.')), 'image/jpeg', 0.86));
      setPhoto(blob); setCapturedAt(new Date().toISOString()); setCaptureSource('web-camera');
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; setCameraReady(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'The photo could not be taken. Please try again.'); }
    finally { setBusy(false); }
  };

  const sample = async () => {
    if (!wallet.session?.isDemo) return;
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
    const context = canvas.getContext('2d')!;
    const image = new Image(); image.src = '/demo/sample-check.svg';
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('The sample image could not be loaded.')); });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.fillStyle = '#164f40'; context.fillRect(0, 700, 1200, 100);
    context.fillStyle = '#ffffff'; context.font = 'bold 32px sans-serif'; context.fillText(`DEMO SAMPLE · ${challenge?.code ?? 'CHECK'}`, 40, 755);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/jpeg', 0.9));
    setPhoto(blob); setPoint({ latitude: bounty.latitude, longitude: bounty.longitude, accuracy: 10 });
    setCapturedAt(new Date().toISOString()); setCaptureSource('demo-sample'); setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!wallet.session || !photo || !point || !challenge) return;
    setBusy(true); setError('');
    try {
      const photoHash = await sha256(new Uint8Array(await photo.arrayBuffer()));
      const manifest = {
        version: 1, bountyId: bounty.id, chainId: bounty.chainId, scoutWallet: wallet.session.wallet,
        challenge: challenge.nonce, code: challenge.code, photoHash, capturedAt, captureSource,
        latitude: point.latitude, longitude: point.longitude, accuracyMeters: point.accuracy, answers, note: note.trim(),
      };
      const message = canonicalJson(manifest);
      const signature = await wallet.signMessage(message);
      const form = new FormData(); form.set('manifest', message); form.set('signature', signature); form.set('photo', photo, 'field-photo.jpg');
      const prepared = await prepare(`/bounties/${bounty.id}/reports/prepare`, form, wallet.session);
      const chainSignature = await wallet.send(prepared);
      const result = await api<Bounty>(`/bounties/${bounty.id}/confirm`, {
        method: 'POST', body: JSON.stringify({ preparedId: prepared.preparedId, signature: chainSignature }),
      }, wallet.session);
      notify('Signed report submitted. The buyer can now review it.'); onSubmitted(result); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : 'The report could not be submitted. Please try again.'); }
    finally { setBusy(false); }
  };

  const complete = bounty.checklist.every(check => !!answers[check.id]);

  return <Sheet open={open} onOpenChange={value => { if (!value && !busy) onClose(); }} title="Send a field report" description="Answer each check, then capture and sign what you saw." wide>
    <form onSubmit={submit} className="dialog-body report-form">
      <div className="field-heading"><span className="eyebrow">Your checklist</span><Button variant="ghost" type="button" className="small-button" onClick={() => void speakBrief(`ScoutVault check. ${bounty.checklist.map((check, index) => `Check ${index + 1}. ${check.question}. ${check.hint}`).join(' ')}`).catch(error => notify(error.message))}><Volume2 size={16} aria-hidden />Play brief</Button></div>
      {bounty.checklist.map((check, index) => <fieldset className="report-check" key={check.id}><legend><span className="check-number">{index + 1}</span>{check.question}{answers[check.id] && <motion.span initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }} className="answer-check"><Check size={16} aria-hidden /></motion.span>}</legend><p>{check.hint}</p><div className="answer-options">{(['yes', 'no', 'unclear'] as const).map(answer => <label className={answers[check.id] === answer ? 'answer-selected' : ''} key={answer}><input type="radio" name={`answer-${check.id}`} value={answer} checked={answers[check.id] === answer} onChange={() => setAnswers({ ...answers, [check.id]: answer })} required /><span>{answer === 'yes' ? 'Yes' : answer === 'no' ? 'No' : 'Could not confirm'}</span></label>)}</div></fieldset>)}
      <Field label="What else should the buyer know?" id="field-note" hint="Describe what you saw. Leave out names, faces, and private belongings."><textarea id="field-note" name="field-note" autoComplete="off" rows={3} maxLength={1200} placeholder="The water tank is there, but I could not check the supply…" value={note} onChange={event => setNote(event.target.value)} /></Field>
      {challenge && <div className="capture-instruction"><Camera size={19} aria-hidden /><div><strong>Fresh capture · {challenge.code}</strong><p>{challenge.instruction}</p></div></div>}
      <div className="camera-box">
        {preview ? <img src={preview} alt="Your field report photo" width={1200} height={800} /> : cameraReady ? <video ref={video} muted playsInline autoPlay aria-label="Live camera preview" /> : <div className="camera-empty"><Camera size={32} aria-hidden /><strong>Take a photo in the app.</strong><p>Include the entrance and today’s check code. Photograph only where you have permission.</p></div>}
        {captureSource === 'demo-sample' && preview && <span className="camera-label">Sample illustration · not a site visit</span>}
      </div>
      <div className="camera-actions"><Button variant="secondary" type="button" onClick={() => void (cameraReady ? takePhoto() : openCamera())} disabled={busy || !challenge}>{preview ? <RefreshCcw size={16} aria-hidden /> : <Camera size={16} aria-hidden />}{cameraReady ? 'Take photo' : preview ? 'Retake photo' : 'Open camera'}</Button>{wallet.session?.isDemo && <Button variant="ghost" type="button" onClick={() => void sample().catch(error => setError(error.message))} disabled={busy || !challenge}>Use sample illustration</Button>}</div>
      {point && <p className="location-receipt"><LocateFixed size={14} aria-hidden />{captureSource === 'demo-sample' ? 'Demo coordinates' : `Location attached · accuracy about ${Math.round(point.accuracy)} m`}</p>}
      <div className="review-note"><ShieldCheck size={18} aria-hidden /><p>Your wallet signs this photo hash, checklist and location metadata. The signature identifies the submitting wallet. The buyer still reviews the evidence before payment.</p></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <Button type="submit" disabled={busy || !complete || !photo || !point || !challenge}>{busy ? <Spinner label="Signing and submitting…" /> : <><CheckCheck size={17} aria-hidden />Sign and submit report</>}</Button>
    </form>
  </Sheet>;
}
