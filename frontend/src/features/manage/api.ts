import type { ManageCreds } from "@/features/agent/schemas";
import { apiFetch } from "@/lib/api";

import { dashboardSchema, orderSchema, type OrderStatus } from "./schemas";

export function getDashboard(creds: ManageCreds, signal?: AbortSignal) {
  const q = new URLSearchParams({ slug: creds.slug, key: creds.key });
  return apiFetch(`/api/manage?${q.toString()}`, dashboardSchema, signal ? { signal } : {});
}

export function setOrderStatus(creds: ManageCreds, ref: string, status: OrderStatus) {
  return apiFetch(`/api/manage/orders/${encodeURIComponent(ref)}`, orderSchema, {
    method: "POST",
    body: JSON.stringify({ slug: creds.slug, key: creds.key, status }),
  });
}
