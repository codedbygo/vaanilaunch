import { useQueryClient } from "@tanstack/react-query";
import { useReducer, useState } from "react";

import { useManageStore } from "@/app/stores/manage-store";
import { manageKeys } from "@/features/manage/hooks";
import { storeKeys } from "@/features/stores/hooks";

import { approveDraft, streamAgent, uploadPhoto } from "./api";
import { langOf, type LangCode } from "./languages";
import { manageCredsSchema, type AgentEvent } from "./schemas";
import { initialSession, sessionReducer } from "./session";

const WELCOME =
  "Namaste! 🙏 Tell me about your business: what you sell, where, and your WhatsApp number. Add product photos too. Tap the mic and speak in your language, or type.";
const WELCOME_BACK =
  "👋 Welcome back! Tell me what to change: add a product, change a price, set a holiday notice, or ask for your orders.";

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

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useLaunchSession() {
  const creds = useManageStore((s) => s.creds);
  const setCreds = useManageStore((s) => s.setCreds);
  const qc = useQueryClient();
  const [sessionId] = useState(newSessionId);
  const [state, dispatch] = useReducer(sessionReducer, creds, (c) =>
    initialSession(c ? WELCOME_BACK : WELCOME),
  );
  const [lang, setLang] = useState<LangCode>("te-IN");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);

  const onEvent = (event: AgentEvent) => {
    let key: string | undefined;
    if (event.type === "step" && event.data.status === "done") {
      const m = manageCredsSchema.safeParse(event.data.result?._manage);
      if (m.success) {
        setCreds(m.data);
        key = m.data.key;
      }
    }
    dispatch({ type: "event", event, now: Date.now(), key });
  };

  const send = async (raw: string) => {
    const ready = photos.filter((p) => p.id !== undefined);
    const text = raw.trim() || (ready.length ? "📷 Here are my product photos." : "");
    if (!text || state.busy) return;
    if (ready.length !== photos.length) {
      dispatch({ type: "note", text: "⏳ Photos are still uploading. Send again in a moment." });
      return;
    }
    setPhotos([]);
    dispatch({
      type: "send",
      text,
      images: ready.map((p) => p.url),
      now: Date.now(),
      startTimer: creds === null,
    });
    const current = useManageStore.getState().creds;
    try {
      await streamAgent(
        {
          sessionId,
          images: ready.flatMap((p) => (p.id ? [p.id] : [])),
          text: `${text}\n\n[Preferred language: ${langOf(lang).english}]`,
          manageSlug: current?.slug,
          manageKey: current?.key,
        },
        onEvent,
      );
    } catch (e) {
      dispatch({ type: "note", text: `⚠️ ${errorText(e)}` });
    } finally {
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
        dispatch({ type: "note", text: `⚠️ Photo upload failed: ${errorText(e)}` });
      }
    }
  };

  const removePhoto = (key: string) => {
    setPhotos((p) => p.filter((x) => x.key !== key));
  };

  const approve = async () => {
    if (!state.draft) return;
    try {
      await approveDraft(sessionId, state.draft.slug);
      dispatch({ type: "approved" });
      await send("✅ I approve the preview. Please publish my store.");
    } catch (e) {
      dispatch({ type: "note", text: `⚠️ ${errorText(e)}` });
    }
  };

  return {
    state,
    lang,
    setLang,
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
