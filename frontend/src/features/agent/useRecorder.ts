import { useLayoutEffect, useRef, useState } from "react";

import { transcribeClip } from "./api";

// Voice for the server's speech-to-text (Sarvam). The phone records with its own noise
// suppression, echo cancellation and gain control; long speech is cut into pieces under the
// service's 30-second limit and the text is joined. Tap once to start, again when finished.
export const SEGMENT_MS = 25_000;
const MAX_MS = 3 * 60 * 1000; // safety stop for a mic left on
const MIN_BYTES = 1_000; // shorter than this is a click, not speech

const CONSTRAINTS: MediaStreamConstraints = {
  audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true, channelCount: 1 },
};

/** Chrome and Firefox record WebM/Opus; Safari records MP4. Both are accepted by the server. */
function mimeType(): string {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      resolve(r.result as string); // readAsDataURL always produces a string
    };
    r.onerror = () => {
      reject(r.error ?? new Error("could not read the recording"));
    };
    r.readAsDataURL(blob);
  });

/** getUserMedia failures, in the same codes the browser recognizer uses for its messages. */
const micErrorCode = (e: unknown) =>
  e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")
    ? "not-allowed"
    : "audio-capture";

interface Options {
  lang: string;
  onText: (text: string) => void;
  onEnd: (text: string) => void;
  onError: (code: string) => void;
  /** The speech service failed; text heard so far is passed on, then the browser takes over. */
  onFail: (text: string) => void;
}

export function useRecorder({ lang, onText, onEnd, onError, onFail }: Options) {
  // mediaDevices is missing on plain-http pages even though the DOM types say it always exists.
  const devices = navigator.mediaDevices as MediaDevices | undefined;
  const supported =
    typeof MediaRecorder !== "undefined" && typeof devices?.getUserMedia === "function";
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const want = useRef(false);
  const discard = useRef(false);
  const failed = useRef(false);
  const said = useRef("");
  const startedAt = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // These flags change while awaits are pending; reading them through functions keeps the
  // checks honest (a narrowed `ref.current` would look constant to the type checker).
  const dropped = () => discard.current;
  const wanted = () => want.current;
  const cb = useRef({ onText, onEnd, onError, onFail });
  useLayoutEffect(() => {
    cb.current = { onText, onEnd, onError, onFail };
  });

  const transcribe = (blob: Blob) => {
    if (blob.size < MIN_BYTES) return;
    setTranscribing(true);
    // One clip at a time, in order, so the pieces of a long message join up correctly.
    queue.current = queue.current.then(async () => {
      if (failed.current || discard.current) return;
      try {
        const { text } = await transcribeClip(await toDataUrl(blob), lang);
        if (!dropped() && text) {
          said.current = `${said.current} ${text}`.trim();
          cb.current.onText(said.current);
        }
      } catch {
        failed.current = true;
      }
    });
  };

  const finish = () => {
    stream.current?.getTracks().forEach((t) => {
      t.stop();
    });
    stream.current = null;
    recorder.current = null;
    setListening(false);
    void queue.current.then(() => {
      setTranscribing(false);
      if (discard.current) return;
      if (failed.current) cb.current.onFail(said.current);
      else cb.current.onEnd(said.current);
    });
  };

  const segment = (s: MediaStream) => {
    const type = mimeType();
    const mr = new MediaRecorder(s, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => {
      chunks.push(e.data);
    };
    mr.onstop = () => {
      clearTimeout(timer.current);
      transcribe(new Blob(chunks, { type: mr.mimeType || type }));
      if (want.current && Date.now() - startedAt.current < MAX_MS) segment(s);
      else {
        want.current = false;
        finish();
      }
    };
    recorder.current = mr;
    mr.start();
    timer.current = setTimeout(() => {
      mr.stop();
    }, SEGMENT_MS);
  };

  const start = async () => {
    want.current = true;
    discard.current = false;
    failed.current = false;
    said.current = "";
    startedAt.current = Date.now();
    setListening(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
      if (!wanted()) {
        // Cancelled while the permission prompt was open.
        s.getTracks().forEach((t) => {
          t.stop();
        });
        setListening(false);
        return;
      }
      stream.current = s;
      segment(s);
    } catch (e) {
      want.current = false;
      setListening(false);
      cb.current.onError(micErrorCode(e));
    }
  };

  const stop = () => {
    want.current = false;
    clearTimeout(timer.current);
    recorder.current?.stop(); // onstop transcribes the last piece and finishes
  };

  const toggle = () => {
    if (want.current) stop();
    else void start();
  };

  /** The message was sent: stop and forget what was heard, so it can't come back. */
  const cancel = () => {
    said.current = "";
    discard.current = true;
    if (want.current) stop();
  };

  return { supported, listening, transcribing, toggle, cancel };
}
