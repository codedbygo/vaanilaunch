import { Camera, Mic, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { langOf, speechError } from "../languages";
import type { LaunchSession } from "../useLaunchSession";
import { useSpeech } from "../useSpeech";

// Heights of the listening waveform bars (px).
const WAVE = [10, 20, 30, 18, 26, 14, 28, 22, 12, 24, 16];

export function Composer({ session }: { session: LaunchSession }) {
  const { lang, photos, send, addPhotos, removePhoto, note, state } = session;
  const { t, locale } = useT();
  const [input, setInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const native = langOf(lang).native;

  const submit = (text: string) => {
    speech.cancel(); // a mic still on must not refill the box with this message
    setInput("");
    void send(text);
  };
  const speech = useSpeech({
    lang,
    onText: setInput,
    // What was heard stays in the box: the owner checks it, fixes any word, then taps Send.
    onEnd: (heard) => {
      setInput(heard);
      boxRef.current?.focus();
    },
    onError: (code) => {
      note(`🎤 ${speechError(code, locale)}`);
    },
  });
  const canSend = !state.busy && (input.trim() !== "" || photos.length > 0);

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 border-t pt-3">
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("composer.photos")}>
          {photos.map((p) => (
            <li key={p.key} className="relative size-15">
              <img
                src={p.url}
                alt=""
                className={cn("size-full rounded-xl object-cover", !p.id && "opacity-40")}
              />
              {p.id ? (
                <button
                  type="button"
                  onClick={() => {
                    removePhoto(p.key);
                  }}
                  aria-label={t("composer.removePhoto")}
                  className="absolute -top-1.5 -right-1.5 grid size-5.5 place-items-center rounded-full bg-primary text-primary-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              ) : (
                <span role="status" className="sr-only">
                  {t("composer.uploading")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* The mic is the centrepiece: large, centred, with a waveform while it listens. */}
      <div className="grid justify-items-center gap-3 py-2 text-center">
        <button
          type="button"
          onClick={speech.toggle}
          disabled={!speech.supported || state.busy}
          aria-label={
            speech.listening
              ? t("composer.stopListening")
              : t("composer.speakIn", { language: native })
          }
          className={cn(
            "grid size-20 place-items-center rounded-full text-white shadow-brand transition-transform hover:scale-105 focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-45",
            speech.listening ? "animate-ring bg-rose" : "bg-saffron",
          )}
        >
          <Mic className="size-8" aria-hidden="true" />
        </button>
        {speech.listening && (
          <div className="flex h-8 items-center gap-1" aria-hidden="true">
            {WAVE.map((h, i) => (
              <span
                key={i}
                className="wave-bar w-1 rounded-full bg-rose/70"
                style={{ height: `${String(h)}px`, animationDelay: `${String(i * 80)}ms` }}
              />
            ))}
          </div>
        )}
        <div className="grid gap-0.5">
          <b className="text-base">
            {speech.listening
              ? t("composer.listening")
              : speech.supported
                ? t("composer.tapToSpeak", { language: native })
                : t("composer.noVoice")}
          </b>
          <span className="text-sm text-muted-foreground">
            {speech.listening ? t("composer.listeningHint") : t("composer.idleHint")}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11.5 flex-none rounded-xl"
          onClick={() => fileRef.current?.click()}
          disabled={state.busy || photos.length >= 6}
          aria-label={t("composer.addPhotos")}
        >
          <Camera aria-hidden="true" />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addPhotos(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <Textarea
          ref={boxRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) submit(input);
            }
          }}
          rows={1}
          placeholder={t("composer.placeholder")}
          aria-label={t("composer.message")}
          className="h-11.5 min-h-0 flex-1 resize-none rounded-xl"
        />
        <Button
          type="button"
          className="h-11.5 rounded-xl px-5"
          onClick={() => {
            submit(input);
          }}
          disabled={!canSend}
        >
          {t("composer.send")}
        </Button>
      </div>
    </div>
  );
}
