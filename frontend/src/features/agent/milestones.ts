import {
  checkDomainsResultSchema,
  draftResultSchema,
  publishResultSchema,
  slugResultSchema,
  verifyResultSchema,
  type Domain,
  type Step,
  type VerifyResult,
} from "./schemas";

// The launch as the owner sees it. Each milestone lights up from real tool events.
export type Actor = "Claude" | "GoDaddy" | "VaaniLaunch" | "You";
export type MilestoneStatus = "idle" | "running" | "done" | "wait" | "warn" | "skip";

interface MilestoneDef {
  key: string;
  label: string;
  by: string;
  actor: Actor;
  tools?: string[];
}

export const MILESTONES: MilestoneDef[] = [
  { key: "understand", label: "Understanding your business", by: "Claude", actor: "Claude" },
  {
    key: "domains",
    label: "Finding domains for your brand",
    by: "GoDaddy Domains API",
    actor: "GoDaddy",
    tools: ["suggest_domains", "check_domains"],
  },
  {
    key: "address",
    label: "Reserving your web address",
    by: "VaaniLaunch",
    actor: "VaaniLaunch",
    tools: ["check_slug"],
  },
  {
    key: "build",
    label: "Catalogue from photos + store",
    by: "Claude vision",
    actor: "Claude",
    tools: ["save_draft"],
  },
  { key: "approve", label: "Your approval", by: "You", actor: "You" },
  {
    key: "dns",
    label: "Creating the DNS record",
    by: "GoDaddy DNS API",
    actor: "GoDaddy",
    tools: ["publish_site"],
  },
  {
    key: "verify",
    label: "Checking DNS and HTTPS",
    by: "VaaniLaunch",
    actor: "VaaniLaunch",
    tools: ["verify_site"],
  },
];

export interface MilestoneState extends MilestoneDef {
  status: MilestoneStatus;
  detail?: string | undefined;
  domains?: Domain[] | undefined;
}

export interface LaunchSnapshot {
  steps: Step[];
  busy: boolean;
  started: boolean;
  hasDraft: boolean;
  approved: boolean;
  live: boolean;
}

/** Say only what verify_site actually checked (a local run has no DNS and no HTTPS). */
export function verifyLabel(v: VerifyResult): string {
  if (!v.ok) return "DNS/HTTPS still propagating. The store will come up shortly.";
  if (v.https && v.dns_resolves) return "HTTPS verified, DNS record live on GoDaddy";
  if (v.https) return "HTTPS verified";
  return "Store reachable (local preview, no HTTPS)";
}

/** Cheapest three available domains across every check_domains call. */
export function topDomains(steps: Step[]): Domain[] {
  return steps
    .filter((s) => s.tool === "check_domains" && s.status === "done")
    .flatMap((s) => checkDomainsResultSchema.safeParse(s.result).data?.results ?? [])
    .filter((d) => d.available)
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    .slice(0, 3);
}

function toolMilestone(m: MilestoneDef, steps: Step[]): Omit<MilestoneState, keyof MilestoneDef> {
  const mine = steps.filter((s) => m.tools?.includes(s.tool));
  const last = mine.at(-1);
  if (!last) return { status: "idle" };
  if (mine.some((s) => s.status === "running")) return { status: "running", detail: last.label };
  const ok = mine.filter((s) => s.status === "done").at(-1);
  if (!ok) return { status: "warn", detail: last.error };
  switch (m.key) {
    case "domains": {
      const domains = topDomains(steps);
      return { status: "done", domains, detail: domains.length ? undefined : "Domain ideas ready" };
    }
    case "address":
      return { status: "done", detail: slugResultSchema.safeParse(ok.result).data?.slug };
    case "build": {
      const products = draftResultSchema.safeParse(ok.result).data?.products ?? 0;
      return { status: "done", detail: `${String(products)} products, bilingual` };
    }
    case "dns": {
      const record = publishResultSchema.safeParse(ok.result).data?.dns?.record;
      return { status: "done", detail: record ? `A record ${record}` : "Served via wildcard DNS" };
    }
    case "verify": {
      const v = verifyResultSchema.safeParse(ok.result).data;
      if (!v) return { status: "done" };
      return { status: v.ok ? "done" : "warn", detail: verifyLabel(v) };
    }
    default:
      return { status: "done" };
  }
}

function milestone(m: MilestoneDef, s: LaunchSnapshot): Omit<MilestoneState, keyof MilestoneDef> {
  if (m.key === "understand") {
    if (s.steps.length || s.hasDraft || s.live) return { status: "done" };
    return { status: s.busy ? "running" : s.started ? "done" : "idle" };
  }
  if (m.key === "approve") {
    if (s.live || s.approved) return { status: "done", detail: "Approved by the owner" };
    return s.hasDraft
      ? { status: "wait", detail: "Check the phone preview, then tap Approve & publish" }
      : { status: "idle" };
  }
  return toolMilestone(m, s.steps);
}

/** Every milestone's state; a step the agent never needed shows as skipped once later ones ran. */
export function deriveMilestones(s: LaunchSnapshot): MilestoneState[] {
  const states = MILESTONES.map((m) => ({ ...m, ...milestone(m, s) }));
  const lastActive = states.map((x) => x.status !== "idle").lastIndexOf(true);
  return states.map((x, i) =>
    x.status === "idle" && i < lastActive ? { ...x, status: "skip" } : x,
  );
}
