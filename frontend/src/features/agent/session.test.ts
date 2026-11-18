import { describe, expect, it } from "vitest";

import type { Step } from "./schemas";
import { initialSession, sessionReducer, type SessionState } from "./session";

const step = (tool: string, result: Record<string, unknown>, label = tool): Step => ({
  id: tool,
  tool,
  label,
  status: "done",
  result,
});
const ev = (s: SessionState, st: Step, now = 0, preview?: string) =>
  sessionReducer(s, { type: "event", event: { type: "step", data: st }, now, preview });

describe("sessionReducer", () => {
  it("runs a launch: send starts the timer, draft, approval, publish, verify", () => {
    let s = initialSession("hi");
    s = sessionReducer(s, {
      type: "send",
      text: "I sell idli",
      images: ["/media/a.jpg"],
      now: 1000,
      startTimer: true,
    });
    expect(s.busy).toBe(true);
    expect(s.startedAt).toBe(1000);
    expect(s.messages.at(-1)).toMatchObject({
      role: "me",
      text: "I sell idli",
      images: ["/media/a.jpg"],
    });

    s = ev(
      s,
      step(
        "save_draft",
        { needs_approval: true, slug: "lt", preview_url: "/s/lt?preview=1", products: 3 },
        "Building store “Lakshmi Tiffins” (3 products)",
      ),
      2000,
      "9.t&k",
    );
    expect(s.draft).toEqual({
      slug: "lt",
      previewUrl: "/s/lt?preview=1&t=9.t%26k",
      approved: false,
    });
    expect(s.storeName).toBe("Lakshmi Tiffins");

    s = sessionReducer(s, { type: "approved" });
    expect(s.draft?.approved).toBe(true);

    s = ev(s, step("publish_site", { live: true, url: "http://x/s/lt" }), 61_000);
    expect(s.live).toEqual({ url: "http://x/s/lt" });
    expect(s.draft).toBeNull();
    expect(s.launchMs).toBe(60_000);
    expect(s.celebrate).toBe(true);

    s = ev(s, step("verify_site", { ok: true, https: false }));
    expect(s.live?.verify).toEqual({ ok: true, https: false });

    const v = s.previewVersion;
    s = ev(s, step("update_site", { updated: true }));
    expect(s.previewVersion).toBe(v + 1);

    s = sessionReducer(s, { type: "turn-end" });
    expect(s.busy).toBe(false);
  });

  it("does not start the timer when managing an existing store", () => {
    const s = sessionReducer(initialSession("hi"), {
      type: "send",
      text: "x",
      images: [],
      now: 5,
      startTimer: false,
    });
    expect(s.startedAt).toBeNull();
  });

  it("updates a running step in place and adds messages and errors", () => {
    let s = initialSession("hi");
    s = sessionReducer(s, {
      type: "event",
      event: { type: "step", data: { id: "a", tool: "check_slug", label: "x", status: "running" } },
      now: 0,
    });
    s = ev(s, { id: "a", tool: "check_slug", label: "x", status: "done", result: { slug: "x" } });
    expect(s.steps).toHaveLength(1);
    expect(s.steps[0]?.status).toBe("done");

    s = sessionReducer(s, { type: "event", event: { type: "message", data: "Namaste" }, now: 0 });
    s = sessionReducer(s, { type: "event", event: { type: "error", data: "boom" }, now: 0 });
    s = sessionReducer(s, { type: "event", event: { type: "done", data: null }, now: 0 });
    s = sessionReducer(s, { type: "note", text: "note" });
    expect(s.messages.map((m) => m.text)).toEqual(["hi", "Namaste", "⚠️ boom", "note"]);
    expect(new Set(s.messages.map((m) => m.id)).size).toBe(4);
  });

  it("ignores approval without a draft and toggles the launch dialog", () => {
    let s = initialSession("hi");
    expect(sessionReducer(s, { type: "approved" })).toBe(s);
    s = sessionReducer(s, { type: "celebrate", open: true });
    expect(s.celebrate).toBe(true);
  });
});
