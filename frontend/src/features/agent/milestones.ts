import {
  DEFAULT_LOCALE,
  isMessageKey,
  translate,
  translatePlural,
  type LangCode,
} from "@/lib/i18n";

import {
  checkDomainsResultSchema,
  draftResultSchema,
  slugResultSchema,
  verifyResultSchema,
  type Domain,
  type Step,
  type VerifyResult,
} from "./schemas";

// The launch as the owner sees it. Each milestone lights up from real tool events.
export type Actor = "Claude" | "GoDaddy" | "VaaniLaunch" | "You";
export type MilestoneStatus = "idle" | "running" | "done" | "wait" | "warn" | "skip";

type MilestoneKey = "understand" | "domains" | "address" | "build" | "approve" | "dns" | "verify";

interface MilestoneDef {
  key: MilestoneKey;
  actor: Actor;
  tools?: string[];
}

export const MILESTONES: MilestoneDef[] = [
  { key: "understand", actor: "Claude" },
  { key: "domains", actor: "GoDaddy", tools: ["suggest_domains", "check_domains"] },
  { key: "address", actor: "VaaniLaunch", tools: ["check_slug"] },
  { key: "build", actor: "Claude", tools: ["save_draft"] },
  { key: "approve", actor: "You" },
  { key: "dns", actor: "GoDaddy", tools: ["publish_site"] },
  { key: "verify", actor: "VaaniLaunch", tools: ["verify_site"] },
];

export interface MilestoneState extends MilestoneDef {
  label: string;
  by: string;
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
  /** Which model really answered; AI steps say so honestly when the free backup ran. */
  modelLabel?: string;
  /** The owner's language for every label and detail. */
  locale?: LangCode;
}

function byLabel(m: MilestoneDef, model: string, locale: LangCode): string {
  if (m.actor !== "Claude" || model === "Claude") return translate(locale, `milestone.${m.key}.by`);
  return translate(locale, m.key === "build" ? "milestone.freeModelVision" : "milestone.freeModel");
}

/** Say only what verify_site actually checked (a local run has no DNS and no HTTPS). */
export function verifyLabel(v: VerifyResult, locale: LangCode = DEFAULT_LOCALE): string {
  if (!v.ok) return translate(locale, "milestone.verify.propagating");
  if (v.https && v.dns_resolves) return translate(locale, "milestone.verify.live");
  if (v.https) return translate(locale, "milestone.verify.https");
  return translate(locale, "milestone.verify.local");
}

/** What a running tool is doing, in the owner's language (unknown tools get a generic line). */
export function toolLabel(tool: string, locale: LangCode = DEFAULT_LOCALE): string {
  const key = `tool.${tool}`;
  return translate(locale, isMessageKey(key) ? key : "tool.fallback");
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

type Progress = Omit<MilestoneState, keyof MilestoneDef | "label" | "by">;

function toolMilestone(m: MilestoneDef, steps: Step[], locale: LangCode): Progress {
  const mine = steps.filter((s) => m.tools?.includes(s.tool));
  const last = mine.at(-1);
  if (!last) return { status: "idle" };
  if (mine.some((s) => s.status === "running"))
    return { status: "running", detail: toolLabel(last.tool, locale) };
  const ok = mine.filter((s) => s.status === "done").at(-1);
  // The tool's own error text is English and for logs; the agent explains it in the chat.
  if (!ok) return { status: "warn", detail: translate(locale, "error.generic") };
  switch (m.key) {
    case "domains": {
      const domains = topDomains(steps);
      return {
        status: "done",
        domains,
        detail: domains.length ? undefined : translate(locale, "milestone.domainIdeas"),
      };
    }
    case "address":
      return { status: "done", detail: slugResultSchema.safeParse(ok.result).data?.slug };
    case "build": {
      const products = draftResultSchema.safeParse(ok.result).data?.products ?? 0;
      return { status: "done", detail: translatePlural(locale, "milestone.products", products) };
    }
    case "dns": {
      return { status: "done", detail: translate(locale, "milestone.addressReady") };
    }
    default: {
      // "verify", the last tool milestone
      const v = verifyResultSchema.safeParse(ok.result).data;
      if (!v) return { status: "done" };
      return { status: v.ok ? "done" : "warn", detail: verifyLabel(v, locale) };
    }
  }
}

function milestone(m: MilestoneDef, s: LaunchSnapshot, locale: LangCode): Progress {
  if (m.key === "understand") {
    if (s.steps.length || s.hasDraft || s.live) return { status: "done" };
    return { status: s.busy ? "running" : s.started ? "done" : "idle" };
  }
  if (m.key === "approve") {
    if (s.live || s.approved)
      return { status: "done", detail: translate(locale, "milestone.approvedByOwner") };
    return s.hasDraft
      ? { status: "wait", detail: translate(locale, "milestone.approveHint") }
      : { status: "idle" };
  }
  return toolMilestone(m, s.steps, locale);
}

/** Every milestone's state; a step the agent never needed shows as skipped once later ones ran. */
export function deriveMilestones(s: LaunchSnapshot): MilestoneState[] {
  const model = s.modelLabel ?? "Claude";
  const locale = s.locale ?? DEFAULT_LOCALE;
  const states = MILESTONES.map((m) => ({
    ...m,
    label: translate(locale, `milestone.${m.key}.label`),
    by: byLabel(m, model, locale),
    ...milestone(m, s, locale),
  }));
  const lastActive = states.map((x) => x.status !== "idle").lastIndexOf(true);
  return states.map((x, i) =>
    x.status === "idle" && i < lastActive ? { ...x, status: "skip" } : x,
  );
}
