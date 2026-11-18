import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Actor, MilestoneState, MilestoneStatus } from "../milestones";

const ACTOR_STYLE: Record<Actor, string> = {
  Claude: "bg-accent text-accent-foreground",
  GoDaddy: "bg-godaddy-soft text-godaddy",
  You: "bg-warning-soft text-warning",
  VaaniLaunch: "bg-secondary text-muted-foreground",
};

const DOT_STYLE: Record<MilestoneStatus, string> = {
  done: "bg-success text-white",
  running: "bg-card text-saffron",
  wait: "animate-pulse bg-warning-soft text-warning ring-4 ring-warning-soft",
  warn: "bg-warning-soft text-warning",
  skip: "bg-secondary text-muted-foreground",
  idle: "bg-secondary text-muted-foreground ring-1 ring-border",
};

function Dot({ status, n }: { status: MilestoneStatus; n: number }) {
  return (
    <span
      className={cn(
        "grid size-7 flex-none place-items-center rounded-full text-xs font-extrabold",
        DOT_STYLE[status],
      )}
      aria-hidden="true"
    >
      {status === "done" && <Check className="size-4" />}
      {status === "running" && <Loader2 className="size-4 animate-spin" />}
      {(status === "wait" || status === "warn") && "!"}
      {status === "skip" && "–"}
      {status === "idle" && n}
    </span>
  );
}

const STATUS_TEXT: Record<MilestoneStatus, string> = {
  done: "done",
  running: "in progress",
  wait: "waiting for you",
  warn: "needs attention",
  skip: "skipped",
  idle: "not started",
};

export function Timeline({ milestones }: { milestones: MilestoneState[] }) {
  return (
    <ol className="m-0 list-none p-0">
      {milestones.map((m, i) => (
        <li key={m.key} className="relative flex gap-3 pb-3.5">
          {i < milestones.length - 1 && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-8 bottom-0 left-3.25 w-0.5",
                m.status === "done" ? "bg-success-soft" : "bg-border",
              )}
            />
          )}
          <Dot status={m.status} n={i + 1} />
          <div
            className={cn(
              "min-w-0 flex-1 pt-0.5",
              (m.status === "idle" || m.status === "skip") && "opacity-50",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <b className="text-sm">
                {m.label}
                <span className="sr-only">, {STATUS_TEXT[m.status]}</span>
              </b>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap",
                  ACTOR_STYLE[m.actor],
                )}
              >
                {m.by}
              </span>
            </div>
            {m.detail && (
              <small className="mt-0.5 block text-sm break-words text-muted-foreground">
                {m.detail}
              </small>
            )}
            {m.domains && m.domains.length > 0 && (
              <div className="mt-2 grid gap-1.5">
                {m.domains.map((d) => (
                  <a
                    key={d.domain}
                    href={`https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d.domain)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex justify-between rounded-xl border border-godaddy-soft bg-godaddy-soft px-3 py-2 text-sm no-underline"
                  >
                    <b>{d.domain}</b>
                    {d.price != null && (
                      <span className="font-bold text-godaddy">
                        {d.currency === "INR" ? "₹" : d.currency ? `${d.currency} ` : ""}
                        {d.price}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
