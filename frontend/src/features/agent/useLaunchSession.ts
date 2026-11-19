import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducer, useRef, useState } from "react";

import { useManageStore } from "@/app/stores/manage-store";
import { manageKeys } from "@/features/manage/hooks";
import { storeKeys } from "@/features/stores/hooks";
import { ApiError } from "@/lib/api";
import { errorKey } from "@/lib/error-message";
import { DEFAULT_LOCALE, translate, useLocaleStore, type MessageKey } from "@/lib/i18n";

import { approveDraft, getVoiceConfig, streamAgent, uploadPhoto } from "./api";
import { langOf } from "./languages";
import { getPowSolution } from "./pow";
import { manageCredsSchema, type AgentEvent } from "./schemas";
import { initialSession, sessionReducer } from "./session";

export interface PendingPhoto {
  key: string;
  url: string;
  id?: string;
}

// randomUUID exists only on secure origins; a phone testing over http://<LAN IP> needs the fallback.
function newSessionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** No event from the agent for this long means the stream is stuck: stop it and offer a retry. */
export const STALL_MS = 120_000;

interface Turn {
  text: string;
  images: { id: string; url: string }[];
}

const welcome = (key: MessageKey) => initialSession(translate(DEFAULT_LOCALE, key), key);

export function useLaunchSession() {
  const creds = useManageStore((s) => s.creds);
  const setCreds = useManageStore((s) => s.setCreds);
  const qc = useQueryClient();
  // Server speech-to-text (Sarvam) when the server has a key; asked once per visit.
  const voice = useQuery({
    queryKey: ["voice-config"],
    queryFn: ({ signal }) => getVoiceConfig(signal),
    staleTime: Infinity,
    retry: false,
  });
  const [sessionId] = useState(newSessionId);
  const [state, dispatch] = useReducer(sessionReducer, creds, (c) =>
    welcome(c ? "studio.welcomeBack" : "studio.welcome"),
  );
  // One language for the page, the mic and the agent: the owner's choice, shared app-wide.
  const lang = useLocaleStore((s) => s.locale);
  const say = (key: MessageKey, vars?: Record<string, string>) =>
    translate(useLocaleStore.getState().locale, key, vars);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  // The last message that failed (error, timeout, lost connection), kept so one tap resends it.
  const [failed, setFailed] = useState<Turn | null>(null);

  // The server knows this session once a first message got through; only then is no puzzle needed.
  const known = useRef(false);

  const onEvent = (event: AgentEvent, turn: Turn) => {
    if (event.type === "error") setFailed(turn);
    let preview: string | undefined;
    if (event.type === "step" && event.data.status === "done") {
      const m = manageCredsSchema.safeParse(event.data.result?._manage);
      if (m.success) setCreds(m.data);
      const t = event.data.result?._preview;
      if (typeof t === "string") preview = t;
    }
    dispatch({ type: "event", event, now: Date.now(), preview });
  };

  const send = async (raw: string) => {
    const ready = photos.filter((p): p is PendingPhoto & { id: string } => p.id !== undefined);
    const text = raw.trim() || (ready.length ? say("studio.photosMessage") : "");
    if (!text || state.busy) return;
    if (ready.length !== photos.length) {
      dispatch({ type: "note", text: say("studio.photosUploading") });
      return;
    }
    setPhotos([]);
    await deliver({ text, images: ready.map((p) => ({ id: p.id, url: p.url })) });
  };

  const deliver = async (turn: Turn) => {
    const { text } = turn;
    setFailed(null);
    dispatch({
      type: "send",
      text,
      images: turn.images.map((p) => p.url),
      now: Date.now(),
      startTimer: creds === null,
    });
    const current = useManageStore.getState().creds;
    const stop = new AbortController();
    let timer = setTimeout(() => {
      stop.abort();
    }, STALL_MS);
    try {
      // A brand-new visitor proves it's a browser, not a script (a manage link is proof enough).
      const pow = known.current || current ? undefined : await getPowSolution();
      await streamAgent(
        {
          sessionId,
          images: turn.images.map((p) => p.id),
          text: `${text}\n\n[Preferred language: ${langOf(lang).english}]`,
          manageSlug: current?.slug,
          manageKey: current?.key,
          pow,
        },
        (event) => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            stop.abort();
          }, STALL_MS);
          onEvent(event, turn);
        },
        stop.signal,
      );
      known.current = true;
    } catch (e) {
      setFailed(turn);
      const why = stop.signal.aborted ? "error.timeout" : errorKey(e);
      dispatch({ type: "note", text: `⚠️ ${say(why)}` });
    } finally {
      clearTimeout(timer);
      dispatch({ type: "turn-end" });
      void qc.invalidateQueries({ queryKey: manageKeys.all });
      void qc.invalidateQueries({ queryKey: storeKeys.all });
    }
  };

  const addPhotos = async (files: File[]) => {
    for (const file of files.slice(0, Math.max(0, 6 - photos.length))) {
      const key = Math.random().toString(36).slice(2);
      setPhotos((p) => [...p, { key, url: URL.createObjectURL(file) }]);
      try {
        const up = await uploadPhoto(file);
        setPhotos((p) => p.map((x) => (x.key === key ? { ...x, id: up.id, url: up.url } : x)));
      } catch (e) {
        setPhotos((p) => p.filter((x) => x.key !== key));
        // A server answer maps by status; anything local (not an image, resize failed) is the photo.
        const why = e instanceof ApiError ? errorKey(e) : "error.badPhoto";
        dispatch({ type: "note", text: say("studio.photoFailed", { error: say(why) }) });
      }
    }
  };

  const removePhoto = (key: string) => {
    setPhotos((p) => p.filter((x) => x.key !== key));
  };

  /** Approve this tab's draft, or (after a reload) the owner's draft store given by `slug`. */
  const approve = async (slug?: string) => {
    const target = state.draft?.slug ?? slug;
    if (!target) return;
    try {
      await approveDraft(sessionId, target, useManageStore.getState().creds?.key);
      dispatch({ type: "approved" });
      await send(say("studio.approveMessage"));
    } catch (e) {
      dispatch({ type: "note", text: `⚠️ ${say(errorKey(e))}` });
    }
  };

  return {
    state,
    lang,
    serverVoice: voice.data?.server ?? false,
    failed: failed !== null,
    retry: async () => {
      if (failed && !state.busy) await deliver(failed);
    },
    photos,
    send,
    addPhotos,
    removePhoto,
    approve,
    note: (text: string) => {
      dispatch({ type: "note", text });
    },
    setCelebrate: (open: boolean) => {
      dispatch({ type: "celebrate", open });
    },
  };
}

export type LaunchSession = ReturnType<typeof useLaunchSession>;
