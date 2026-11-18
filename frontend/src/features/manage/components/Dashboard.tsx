import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { qrUrl } from "@/features/agent/api";
import type { ManageCreds } from "@/features/agent/schemas";
import { errorKey } from "@/lib/error-message";
import { inr } from "@/lib/format";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { useDashboard, useSetOrderStatus } from "../hooks";
import type { Dashboard as DashboardData, Order, OrderStatus } from "../schemas";
import { OwnerSettings } from "./OwnerSettings";

const STATUS: Record<OrderStatus, { label: MessageKey; className: string }> = {
  pending_payment: {
    label: "order.status.pending_payment",
    className: "bg-warning-soft text-warning",
  },
  paid: { label: "order.status.paid", className: "bg-success-soft text-success" },
  delivered: { label: "order.status.delivered", className: "bg-godaddy-soft text-godaddy" },
  cancelled: { label: "order.status.cancelled", className: "bg-destructive/10 text-destructive" },
};

/** Launch readiness from the store's real fields: the score is done / total, nothing estimated. */
function Checklist({ items }: { items: NonNullable<DashboardData["checklist"]> }) {
  const { t } = useT();
  const done = items.filter((i) => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  return (
    <section aria-label={t("checklist.title")} className="grid gap-2 rounded-xl border p-3">
      <div className="flex items-center justify-between text-sm font-bold">
        {t("checklist.title")}
        <span className={pct === 100 ? "text-success" : "text-warning"}>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-success" style={{ width: `${String(pct)}%` }} />
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {items.map((i) => (
          <li key={i.key} className={i.done ? "" : "text-muted-foreground"}>
            {i.done ? "✓" : "○"} {t(`checklist.${i.key}`)}
          </li>
        ))}
      </ul>
      {pct < 100 && <p className="text-xs text-muted-foreground">{t("checklist.hint")}</p>}
    </section>
  );
}

function OrderRow({ order, creds }: { order: Order; creds: ManageCreds }) {
  const update = useSetOrderStatus(creds);
  const { t } = useT();
  const s = STATUS[order.status];
  return (
    <li className="grid justify-items-start gap-1 rounded-xl border px-3 py-2.5">
      <div className="flex w-full items-center gap-2">
        <b>{order.ref}</b>
        <Badge className={cn("border-0", s.className)}>{t(s.label)}</Badge>
        <b className="ml-auto">{inr(order.total)}</b>
      </div>
      <small className="text-sm">
        {order.items.map((l) => `${l.name ?? t("dash.item")} × ${String(l.qty)}`).join(", ")}
      </small>
      <small className="text-sm text-muted-foreground">
        {order.customer.name} · {order.customer.phone}
        {order.customer.note ? ` · ${order.customer.note}` : ""}
      </small>
      {order.status === "pending_payment" && (
        <Button
          size="sm"
          className="rounded-full"
          disabled={update.isPending}
          onClick={() => {
            update.mutate({ ref: order.ref, status: "paid" });
          }}
        >
          {t("dash.moneyReceived")}
        </Button>
      )}
      {order.status === "paid" && (
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={update.isPending}
          onClick={() => {
            update.mutate({ ref: order.ref, status: "delivered" });
          }}
        >
          {t("dash.markDelivered")}
        </Button>
      )}
    </li>
  );
}

export function Dashboard({ creds }: { creds: ManageCreds }) {
  const q = useDashboard(creds, true);
  const { t } = useT();

  if (q.isPending) {
    return (
      <div role="status" aria-label={t("dash.loading")} className="grid gap-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-20" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div role="alert" className="grid justify-items-start gap-2">
        <p className="text-sm text-muted-foreground">
          {t("dash.loadFailed", { error: t(errorKey(q.error)) })}
        </p>
        <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
          {t("dash.retry")}
        </Button>
      </div>
    );
  }

  const d = q.data;
  const pending = d.orders.filter((o) => o.status === "pending_payment").length;
  const value = d.orders.filter((o) => o.status !== "cancelled").reduce((t, o) => t + o.total, 0);
  return (
    <div className="grid content-start gap-3">
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <b className="text-lg">{d.name ?? d.slug}</b>
          <Badge
            className={cn(
              "border-0",
              d.status === "live"
                ? "bg-success-soft text-success"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {d.status === "live" ? t("dash.live") : t("dash.draft")}
          </Badge>
        </div>
        <a
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm break-all text-accent-foreground underline"
        >
          {d.url}
        </a>
        {d.status === "live" && (
          <a
            className="text-sm font-semibold text-accent-foreground underline"
            href={qrUrl(d.url)}
            download="store-qr.svg"
          >
            ⬇ {t("launch.downloadQr")}
          </a>
        )}
      </div>
      {d.checklist && d.checklist.length > 0 && <Checklist items={d.checklist} />}
      <dl className="grid grid-cols-3 gap-2">
        {[
          [String(d.orders.length), t("dash.orders")],
          [String(pending), t("dash.awaiting")],
          [inr(value), t("dash.value")],
        ].map(([v, label]) => (
          <div key={label} className="rounded-xl bg-secondary p-2.5">
            <dd className="text-lg font-bold">{v}</dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <OwnerSettings creds={creds} dash={d} />
      <h3 className="text-sm font-bold">{t("dash.ordersTitle")}</h3>
      {d.orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("dash.noOrders")}</p>
      ) : (
        <ul className="grid max-h-96 gap-2 overflow-auto">
          {d.orders.map((o) => (
            <OrderRow key={o.ref} order={o} creds={creds} />
          ))}
        </ul>
      )}
    </div>
  );
}
