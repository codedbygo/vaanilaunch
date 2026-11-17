import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ManageCreds } from "@/features/agent/schemas";

import { getDashboard, setOrderStatus } from "./api";
import type { OrderStatus } from "./schemas";

export const manageKeys = {
  all: ["manage"] as const,
  dashboard: (slug: string, key: string) => [...manageKeys.all, "dashboard", slug, key] as const,
};

/** The owner's store and orders. Polls, because customers order at any time. */
export function useDashboard(creds: ManageCreds | null, enabled: boolean) {
  return useQuery({
    queryKey: manageKeys.dashboard(creds?.slug ?? "", creds?.key ?? ""),
    queryFn: creds && enabled ? ({ signal }) => getDashboard(creds, signal) : skipToken,
    refetchInterval: 10_000,
  });
}

export function useSetOrderStatus(creds: ManageCreds) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, status }: { ref: string; status: OrderStatus }) =>
      setOrderStatus(creds, ref, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: manageKeys.all }),
    onError: (e) => toast.error(`Could not update the order: ${e.message}`),
  });
}
