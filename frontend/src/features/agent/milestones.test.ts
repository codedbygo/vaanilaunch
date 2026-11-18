import { describe, expect, it } from "vitest";

import { deriveMilestones, topDomains, verifyLabel, type LaunchSnapshot } from "./milestones";
import type { Step } from "./schemas";

const base: LaunchSnapshot = {
  steps: [],
  busy: false,
  started: false,
  hasDraft: false,
  approved: false,
  live: false,
};
const done = (tool: string, result: Record<string, unknown>, id = tool): Step => ({
  id,
  tool,
  label: tool,
  status: "done",
  result,
});
const byKey = (s: LaunchSnapshot) => Object.fromEntries(deriveMilestones(s).map((m) => [m.key, m]));

describe("deriveMilestones", () => {
  it("starts idle, then shows understanding while the agent thinks", () => {
    expect(deriveMilestones(base).every((m) => m.status === "idle")).toBe(true);
    expect(byKey({ ...base, busy: true, started: true }).understand?.status).toBe("running");
  });

  it("walks a whole launch: domains, address, build, approval wait, DNS, verify", () => {
    const steps: Step[] = [
      {
        id: "s",
        tool: "suggest_domains",
        label: "Asking GoDaddy",
        status: "error",
        error: "GoDaddy API key/secret not configured",
      },
    ];
    let m = byKey({ ...base, started: true, steps });
    expect(m.domains?.status).toBe("warn");
    // The tool's English error text is for logs; the owner sees a message in her language.
    expect(m.domains?.detail).toBe("Something went wrong. Please try again.");

    steps.push(
      done("check_domains", {
        results: [
          { domain: "b.in", available: true, price: 12, currency: "USD" },
          { domain: "a.in", available: true, price: 9, currency: "USD" },
          { domain: "taken.in", available: false, price: 1 },
          { domain: "c.in", available: true, price: null },
          { domain: "d.in", available: true, price: 30 },
        ],
      }),
      done("check_slug", { slug: "lakshmi-tiffins" }),
      done("save_draft", {
        needs_approval: true,
        slug: "lakshmi-tiffins",
        preview_url: "/s/x",
        products: 3,
      }),
    );
    m = byKey({ ...base, started: true, steps, hasDraft: true });
    expect(m.domains?.domains?.map((d) => d.domain)).toEqual(["a.in", "b.in", "d.in"]);
    expect(m.address?.detail).toBe("lakshmi-tiffins");
    expect(m.build?.detail).toBe("3 products, bilingual");
    expect(m.approve?.status).toBe("wait");

    steps.push(
      done("publish_site", { live: true, url: "http://x", dns: { skipped: true } }),
      done("verify_site", { ok: true, https: false }),
    );
    m = byKey({ ...base, started: true, steps, live: true });
    expect(m.approve?.status).toBe("done");
    expect(m.dns?.detail).toBe("Web address ready");
    expect(m.verify?.detail).toBe("Store reachable (local preview, no HTTPS)");
  });

  it("marks steps the agent skipped once later ones ran, and shows running tools", () => {
    const m = byKey({
      ...base,
      started: true,
      steps: [{ id: "p", tool: "save_draft", label: "Building store", status: "running" }],
    });
    expect(m.domains?.status).toBe("skip");
    expect(m.build?.status).toBe("running");
    expect(m.build?.detail).toBe("Building your store");
    expect(m.dns?.status).toBe("idle");
  });

  it("names the real DNS record and a failed verification", () => {
    const m = byKey({
      ...base,
      live: true,
      steps: [
        done("publish_site", {
          live: true,
          url: "https://x.vaani.in",
          dns: { record: "x.vaani.in" },
        }),
        done("verify_site", { ok: false }),
      ],
    });
    expect(m.dns?.detail).toBe("Web address ready");
    expect(m.verify?.status).toBe("warn");
  });
});

describe("verifyLabel", () => {
  it("claims only what was checked", () => {
    expect(verifyLabel({ ok: true, https: true, dns_resolves: true })).toContain(
      "your store is live",
    );
    expect(verifyLabel({ ok: true, https: true })).toBe("HTTPS verified");
    expect(verifyLabel({ ok: false })).toContain("Still going online");
  });
});

describe("topDomains", () => {
  it("ignores unfinished checks", () => {
    expect(topDomains([{ id: "1", tool: "check_domains", label: "", status: "running" }])).toEqual(
      [],
    );
  });
});
