import { ApiError, apiFetch } from "@/lib/api";
import { env } from "@/lib/env";

import type { PowSolution } from "./pow";
import { approveResultSchema, uploadResultSchema, type AgentEvent } from "./schemas";
import { createSseParser } from "./sse";

export interface AgentRequest {
  sessionId: string;
  text: string;
  images: string[];
  manageSlug?: string | undefined;
  manageKey?: string | undefined;
  pow?: PowSolution | undefined;
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    // fall through to the status text
  }
  return res.statusText || `HTTP ${String(res.status)}`;
}

/**
 * streamAgent posts one owner message and calls onEvent for every streamed event
 * until the server closes the stream. A streaming body is not JSON, so this is the
 * one call that cannot go through apiFetch; it still checks the status first.
 */
export async function streamAgent(
  body: AgentRequest,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${env.VITE_API_URL}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ?? null,
    });
  } catch (cause) {
    throw new ApiError("network", 0, "Could not reach the server. Check your connection.", cause);
  }
  if (!res.ok || !res.body) {
    throw new ApiError("http", res.status, await errorDetail(res));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const feed = createSseParser(onEvent);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    feed(decoder.decode(value, { stream: true }));
  }
}

/** Resize in the browser to at most 1024 px JPEG (saves Claude tokens and bandwidth), then upload. */
export async function uploadPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process photos.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return apiFetch("/api/upload", uploadResultSchema, {
    method: "POST",
    body: JSON.stringify({ dataUrl }),
  });
}

/** The owner's key goes along so approval still works after a server restart (sessions are in memory). */
export function approveDraft(sessionId: string, slug: string, key?: string) {
  return apiFetch("/api/approve", approveResultSchema, {
    method: "POST",
    body: JSON.stringify({ sessionId, slug, key }),
  });
}

export const qrUrl = (data: string) =>
  `${env.VITE_API_URL}/api/qr?data=${encodeURIComponent(data)}`;
