import { isNative, nativeCall } from './native';

export async function speakBrief(text: string): Promise<void> {
  if (isNative()) { await nativeCall('speak', { text }); return; }
  if (!('speechSynthesis' in window)) throw new Error('Audio is unavailable in this browser. The written checklist is ready below.');
  window.speechSynthesis.cancel();
  let voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    await new Promise<void>(resolve => {
      const timeout = setTimeout(resolve, 800);
      window.speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
    voices = window.speechSynthesis.getVoices();
  }
  if (!voices.length) throw new Error('No speech voice is installed in this browser. Use the written checklist, or open the Android app.');
  const voice = voices.find(v => v.localService && v.lang.startsWith('en')) ?? voices.find(v => v.lang.startsWith('en')) ?? voices[0];
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.rate = 0.96;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeech() {
  if (isNative()) void nativeCall('stopSpeech').catch(() => undefined);
  else window.speechSynthesis?.cancel();
}
