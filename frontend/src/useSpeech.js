import { useRef, useState } from 'react';

// Browser speech-to-text (Chrome/Edge). Supports Indian languages via lang codes like te-IN, hi-IN.
export function useSpeech({ lang, onText, onEnd, onError }) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  // Always call the latest callbacks: recognition ends seconds after it starts, when state has moved on.
  const cb = useRef({ onText, onEnd, onError });
  cb.current = { onText, onEnd, onError };

  const toggle = () => {
    if (!SR) return;
    if (recRef.current) { recRef.current.stop(); return; }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = e => {
      finalText = Array.from(e.results).map(r => r[0].transcript).join('');
      cb.current.onText(finalText);
    };
    rec.onend = () => { setListening(false); recRef.current = null; cb.current.onEnd?.(finalText); };
    rec.onerror = e => { setListening(false); cb.current.onError?.(e.error); };
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return { supported: Boolean(SR), listening, toggle };
}
