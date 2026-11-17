import { queryOptions, useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";

import { storeListSchema } from "./schemas";

export const storeKeys = {
  all: ["stores"] as const,
  list: () => [...storeKeys.all, "list"] as const,
};

export const storesOptions = queryOptions({
  queryKey: storeKeys.list(),
  queryFn: ({ signal }) => apiFetch("/api/sites", storeListSchema, { signal }),
});

export const useStores = () => useQuery(storesOptions);
