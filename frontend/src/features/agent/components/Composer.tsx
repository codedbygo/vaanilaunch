import { Camera, Mic, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import { LANGS, langOf, speechError, type LangCode } from "../languages";
import type { LaunchSession } from "../useLaunchSession";
import { useSpeech } from "../useSpeech";

const isLang = (v: string): v is LangCode => LANGS.some((l) => l.code === v);

export function Composer({ session }: { session: LaunchSession }) {
  const { lang, setLang, photos, send, addPhotos, removePhoto, note, state } = session;
  const [input, setInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const native = langOf(lang).native;

  const submit = (text: string) => {
    setInput("");
    void send(text);
  };
  const speech = useSpeech({
    lang,
    onText: setInput,
    onEnd: (t) => {
      if (t.trim()) submit(t);
    },
    onError: (code) => {
      note(`🎤 ${speechError(code)}`);
    },
  });
  const canSend = !state.busy && (input.trim() !== "" || photos.length > 0);

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 border-t pt-3">
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Photos to send">
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
                  aria-label="Remove photo"
                  className="absolute -top-1.5 -right-1.5 grid size-5.5 place-items-center rounded-full bg-primary text-primary-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              ) : (
                <span role="status" className="sr-only">
                  Uploading
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <ToggleGroup
        type="single"
        spacing={1.5}
        value={lang}
        onValueChange={(v) => {
          if (isLang(v)) setLang(v);
        }}
        aria-label="Speaking language"
        className="flex w-full justify-start gap-1.5 overflow-x-auto"
      >
        {LANGS.map((l) => (
          <ToggleGroupItem
            key={l.code}
            value={l.code}
            title={l.english}
            className="flex-none rounded-full border px-3 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {l.native}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={speech.toggle}
          disabled={!speech.supported || state.busy}
          aria-label={speech.listening ? "Stop listening and send" : `Speak in ${native}`}
          className={cn(
            "grid size-16 flex-none place-items-center rounded-full text-white shadow-brand transition-transform hover:scale-105 disabled:opacity-45",
            speech.listening ? "animate-ring bg-rose" : "bg-brand",
          )}
        >
          <Mic className="size-6" aria-hidden="true" />
        </button>
        <div className="grid">
          <b>
            {speech.listening
              ? "Listening… take your time"
              : speech.supported
                ? `Tap and speak in ${native}`
                : "Voice needs Chrome or Edge"}
          </b>
          <span className="text-sm text-muted-foreground">
            {speech.listening
              ? "Tap the mic again when you finish, and it sends"
              : "or type below · up to 6 photos"}
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
          aria-label="Add product photos"
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
          placeholder="Type your message…"
          aria-label="Message"
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
          Send
        </Button>
      </div>
    </div>
  );
}
