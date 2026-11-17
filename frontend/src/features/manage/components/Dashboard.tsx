import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ManageCreds } from "@/features/agent/schemas";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useDashboard, useSetOrderStatus } from "../hooks";
import type { Order, OrderStatus } from "../schemas";

const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  pending_payment: { label: "Payment pending", className: "bg-warning-soft text-warning" },
  paid: { label: "Paid", className: "bg-success-soft text-success" },
  delivered: { label: "Delivered", className: "bg-godaddy-soft text-godaddy" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
};

function OrderRow({ order, creds }: { order: Order; creds: ManageCreds }) {
  const update = useSetOrderStatus(creds);
  const s = STATUS[order.status];
  return (
    <li className="grid justify-items-start gap-1 rounded-xl border px-3 py-2.5">
      <div className="flex w-full items-center gap-2">
        <b>{order.ref}</b>
        <Badge className={cn("border-0", s.className)}>{s.label}</Badge>
        <b className="ml-auto">{inr(order.total)}</b>
      </div>
      <small className="text-sm">
        {order.items.map((l) => `${l.name ?? "Item"} × ${String(l.qty)}`).join(", ")}
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
          Money received ✓
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
          Mark delivered
        </Button>
      )}
    </li>
  );
}

export function Dashboard({ creds }: { creds: ManageCreds }) {
  const q = useDashboard(creds, true);

  if (q.isPending) {
    return (
      <div role="status" aria-label="Loading your store" className="grid gap-3">
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
          Could not load your store: {q.error.message}
        </p>
        <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
          Try again
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
            {d.status === "live" ? "● Live" : "Draft"}
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
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {[
          [String(d.orders.length), "orders"],
          [String(pending), "awaiting payment"],
          [inr(value), "order value"],
        ].map(([v, label]) => (
          <div key={label} className="rounded-xl bg-secondary p-2.5">
            <dd className="text-lg font-bold">{v}</dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <h3 className="text-sm font-bold">Orders</h3>
      {d.orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No orders yet. Share your store link on WhatsApp to get the first one.
        </p>
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
