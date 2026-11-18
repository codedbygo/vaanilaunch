import type { MessageKey } from "@/lib/i18n";

import {
  draftResultSchema,
  publishResultSchema,
  verifyResultSchema,
  type AgentEvent,
  type Step,
  type VerifyResult,
} from "./schemas";

// One launch conversation in this tab. Client state: the server keeps its own copy of
// the history, this is only what the owner sees.

export interface ChatMessage {
  id: number;
  role: "me" | "bot";
  text: string;
  /** A message from the app itself, shown in whatever language the owner picks now. */
  i18nKey?: MessageKey;
  images?: string[];
}

export interface Draft {
  slug: string;
  previewUrl: string;
  approved: boolean;
}

export interface Live {
  url: string;
  verify?: VerifyResult;
}

export interface SessionState {
  messages: ChatMessage[];
  steps: Step[];
  draft: Draft | null;
  live: Live | null;
  storeName: string;
  startedAt: number | null;
  launchMs: number | null;
  busy: boolean;
  celebrate: boolean;
  /** Bumped whenever the store changes, so the phone preview reloads. */
  previewVersion: number;
  /** "Claude" or "Free model": which model really answered, for the timeline badges. */
  modelLabel: string;
  nextId: number;
}

export type SessionAction =
  | { type: "send"; text: string; images: string[]; now: number; startTimer: boolean }
  | { type: "event"; event: AgentEvent; now: number; preview?: string | undefined }
  | { type: "note"; text: string }
  | { type: "turn-end" }
  | { type: "approved" }
  | { type: "celebrate"; open: boolean };

export function initialSession(welcome: string, i18nKey?: MessageKey): SessionState {
  return {
    messages: [{ id: 0, role: "bot", text: welcome, ...(i18nKey ? { i18nKey } : {}) }],
    steps: [],
    draft: null,
    live: null,
    storeName: "",
    startedAt: null,
    launchMs: null,
    busy: false,
    celebrate: false,
    previewVersion: 0,
    modelLabel: "Claude",
    nextId: 1,
  };
}

function addMessage(s: SessionState, m: Omit<ChatMessage, "id">): SessionState {
  return { ...s, messages: [...s.messages, { ...m, id: s.nextId }], nextId: s.nextId + 1 };
}

function applyStep(s: SessionState, step: Step, now: number, preview?: string): SessionState {
  const i = s.steps.findIndex((x) => x.id === step.id);
  const steps = i === -1 ? [...s.steps, step] : s.steps.map((x, j) => (j === i ? step : x));
  let next: SessionState = { ...s, steps };
  if (step.status !== "done") return next;

  const draft = draftResultSchema.safeParse(step.result);
  if (draft.success) {
    const t = preview ? `&t=${encodeURIComponent(preview)}` : "";
    next = {
      ...next,
      draft: { slug: draft.data.slug, previewUrl: draft.data.preview_url + t, approved: false },
      storeName: /“(.+)”/.exec(step.label)?.[1] ?? next.storeName,
      previewVersion: next.previewVersion + 1,
    };
  }
  const pub = publishResultSchema.safeParse(step.result);
  if (pub.success) {
    next = {
      ...next,
      live: { url: pub.data.url },
      draft: null,
      launchMs: next.launchMs ?? (next.startedAt === null ? null : now - next.startedAt),
      celebrate: true,
      previewVersion: next.previewVersion + 1,
    };
  }
  if (step.tool === "verify_site" && next.live) {
    const v = verifyResultSchema.safeParse(step.result);
    if (v.success) next = { ...next, live: { ...next.live, verify: v.data } };
  }
  if (step.tool === "update_site" || step.tool === "undo_last_change")
    next = { ...next, previewVersion: next.previewVersion + 1 };
  return next;
}

function applyEvent(s: SessionState, e: AgentEvent, now: number, preview?: string): SessionState {
  switch (e.type) {
    case "message":
      return addMessage(s, { role: "bot", text: e.data });
    case "error":
      return addMessage(s, { role: "bot", text: `⚠️ ${e.data}` });
    case "step":
      return applyStep(s, e.data, now, preview);
    case "model":
      return { ...s, modelLabel: e.data.label };
    case "done":
      return s;
  }
}

export function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case "send": {
      const started = s.startedAt ?? (a.startTimer ? a.now : null);
      return {
        ...addMessage(s, { role: "me", text: a.text, images: a.images }),
        busy: true,
        startedAt: started,
      };
    }
    case "event":
      return applyEvent(s, a.event, a.now, a.preview);
    case "note":
      return addMessage(s, { role: "bot", text: a.text });
    case "turn-end":
      return { ...s, busy: false };
    case "approved":
      return s.draft ? { ...s, draft: { ...s.draft, approved: true } } : s;
    case "celebrate":
      return { ...s, celebrate: a.open };
  }
}
