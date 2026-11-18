import { manageCredsSchema, type ManageCreds } from "@/features/agent/schemas";
import { apiFetch } from "@/lib/api";

import { dashboardSchema, orderSchema, type OrderStatus } from "./schemas";

/** POST, so the owner's key travels in the body and never lands in a URL, log or history entry. */
export function getDashboard(creds: ManageCreds, signal: AbortSignal) {
  return apiFetch("/api/manage", dashboardSchema, {
    method: "POST",
    body: JSON.stringify({ slug: creds.slug, key: creds.key }),
    signal,
  });
}

export function setOrderStatus(creds: ManageCreds, ref: string, status: OrderStatus) {
  return apiFetch(`/api/manage/orders/${encodeURIComponent(ref)}`, orderSchema, {
    method: "POST",
    body: JSON.stringify({ slug: creds.slug, key: creds.key, status }),
  });
}

/** Replace the owner's private link; the old one stops working immediately. */
export function rotateKey(creds: ManageCreds) {
  return apiFetch("/api/manage/rotate", manageCredsSchema, {
    method: "POST",
    body: JSON.stringify({ slug: creds.slug, key: creds.key }),
  });
}
