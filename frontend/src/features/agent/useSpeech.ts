import { useLayoutEffect, useRef, useState } from "react";

// Browser speech-to-text (Chrome/Edge), Indian languages via codes like te-IN, hi-IN.
// Tap once to start, tap again when finished. Pauses don't end it: the browser stops
// recognition after a few seconds of silence, so we quietly restart until the user taps stop.
const MAX_MS = 3 * 60 * 1000; // safety stop for a mic left on

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

interface Options {
  lang: string;
  onText: (text: string) => void;
  onEnd: (text: string) => void;
  onError: (code: string) => void;
}

export function useSpeech({ lang, onText, onEnd, onError }: Options) {
  const SR = recognitionCtor();
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const want = useRef(false); // the user wants the mic on
  const said = useRef(""); // finished phrases so far, across restarts
  const startedAt = useRef(0);
  // Recognition ends long after it starts; always call the latest callbacks.
  const cb = useRef({ onText, onEnd, onError });
  useLayoutEffect(() => {
    cb.current = { onText, onEnd, onError };
  });

  const begin = (Ctor: RecognitionCtor) => {
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (const res of Array.from(e.results).slice(e.resultIndex)) {
        if (res.isFinal) said.current = `${said.current} ${res[0].transcript}`.trim();
        else interim += res[0].transcript;
      }
      cb.current.onText(`${said.current} ${interim}`.trim());
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // silence: onend restarts
      want.current = false;
      cb.current.onError(e.error);
    };
    r.onend = () => {
      if (want.current && Date.now() - startedAt.current < MAX_MS) {
        try {
          r.start();
          return;
        } catch {
          // fall through and finish
        }
      }
      want.current = false;
      rec.current = null;
      setListening(false);
      cb.current.onEnd(said.current);
    };
    rec.current = r;
    r.start();
  };

  const toggle = () => {
    if (!SR) return;
    if (want.current) {
      want.current = false;
      rec.current?.stop(); // onend sends what was said
      return;
    }
    want.current = true;
    said.current = "";
    startedAt.current = Date.now();
    setListening(true);
    try {
      begin(SR);
    } catch {
      want.current = false;
      setListening(false);
    }
  };

  return { supported: Boolean(SR), listening, toggle };
}
