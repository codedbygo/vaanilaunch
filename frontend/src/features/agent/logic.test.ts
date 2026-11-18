import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/msw";

import { EXAMPLES, LANGS, langOf, speechError, type LangCode } from "./languages";
import { deriveMilestones, type LaunchSnapshot } from "./milestones";
import { getPowSolution, leadingZeroBits, solvePow } from "./pow";
import type { Step } from "./schemas";
import { initialSession, sessionReducer } from "./session";

const base: LaunchSnapshot = {
  steps: [],
  busy: false,
  started: true,
  hasDraft: false,
  approved: false,
  live: false,
};
const done = (tool: string, result: Record<string, unknown>): Step => ({
  id: tool,
  tool,
  label: tool,
  status: "done",
  result,
});
const byKey = (s: LaunchSnapshot) => Object.fromEntries(deriveMilestones(s).map((m) => [m.key, m]));

describe("proof of work", () => {
  it("counts leading zero bits", () => {
    expect(leadingZeroBits(new Uint8Array([0, 0, 1]))).toBe(23);
    expect(leadingZeroBits(new Uint8Array([0x0f]))).toBe(4);
    expect(leadingZeroBits(new Uint8Array([0, 0]))).toBe(16);
  });

  it("finds a nonce the server will accept", async () => {
    const nonce = await solvePow("c", 8);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`c:${nonce}`));
    expect(leadingZeroBits(new Uint8Array(digest))).toBeGreaterThanOrEqual(8);
  });

  it("keeps searching past the first batch when needed", async () => {
    const nonce = await solvePow("batch", 12);
    expect(Number(nonce)).toBeGreaterThan(255);
  });

  it("fetches a challenge and solves it", async () => {
    server.use(http.get("*/api/pow", () => HttpResponse.json({ challenge: "abc", bits: 0 })));
    expect(await getPowSolution()).toEqual({ challenge: "abc", nonce: "0" });
  });
});

describe("languages", () => {
  it("falls back to Telugu for an unknown code and explains unknown voice errors", () => {
    expect(langOf("xx-IN" as LangCode)).toBe(LANGS[0]);
    expect(speechError("not-allowed")).toMatch(/permission/i);
    expect(speechError("bad-grammar")).toContain("(bad-grammar)");
    expect(EXAMPLES.manage).toHaveLength(3);
  });
});

describe("milestones, edge cases", () => {
  it("labels Claude steps honestly when the free backup model answered", () => {
    const m = byKey({ ...base, modelLabel: "Free model" });
    expect(m.understand?.by).toBe("Free model");
    expect(m.build?.by).toBe("Free model (vision)");
    expect(m.domains?.by).toBe("GoDaddy Domains API");
  });

  it("copes with results that don't match the expected shape", () => {
    const m = byKey({
      ...base,
      steps: [
        done("check_domains", { unexpected: true }),
        done("save_draft", { not: "a draft" }),
        done("verify_site", { nonsense: 1 }),
      ],
    });
    expect(m.domains?.detail).toBe("Domain ideas ready");
    expect(m.build?.detail).toBe("0 products, bilingual");
    expect(m.verify?.status).toBe("done");
    expect(m.verify?.detail).toBeUndefined();
  });
});

describe("session reducer, edge cases", () => {
  it("updates one step among several", () => {
    let s = initialSession("hi");
    const ev = (data: Step) =>
      sessionReducer(s, { type: "event", event: { type: "step", data }, now: 0 });
    s = ev({ id: "a", tool: "check_slug", label: "a", status: "running" });
    s = ev({ id: "b", tool: "suggest_domains", label: "b", status: "running" });
    s = ev({ id: "a", tool: "check_slug", label: "a", status: "done", result: { slug: "x" } });
    expect(s.steps.map((x) => `${x.id}:${x.status}`)).toEqual(["a:done", "b:running"]);
  });

  it("records the model, drafts without a preview token, and odd labels", () => {
    let s = initialSession("hi");
    s = sessionReducer(s, {
      type: "event",
      event: { type: "model", data: { model: "nvidia/x:free", label: "Free model" } },
      now: 0,
    });
    expect(s.modelLabel).toBe("Free model");
    s = sessionReducer(s, {
      type: "event",
      event: {
        type: "step",
        data: done("save_draft", {
          needs_approval: true,
          slug: "x",
          preview_url: "/s/x?preview=1",
          products: 1,
        }),
      },
      now: 0,
    });
    expect(s.draft?.previewUrl).toBe("/s/x?preview=1");
    expect(s.storeName).toBe("");
  });

  it("publishes without a timer, and ignores an unreadable verify result", () => {
    let s = initialSession("hi");
    s = sessionReducer(s, {
      type: "event",
      event: { type: "step", data: done("publish_site", { live: true, url: "http://x" }) },
      now: 5,
    });
    expect(s.launchMs).toBeNull();
    s = sessionReducer(s, {
      type: "event",
      event: { type: "step", data: done("verify_site", { garbage: true }) },
      now: 5,
    });
    expect(s.live).toEqual({ url: "http://x" });
  });

  it("does not attach a verify result when nothing is live", () => {
    const s = sessionReducer(initialSession("hi"), {
      type: "event",
      event: { type: "step", data: done("verify_site", { ok: true }) },
      now: 0,
    });
    expect(s.live).toBeNull();
  });
});
