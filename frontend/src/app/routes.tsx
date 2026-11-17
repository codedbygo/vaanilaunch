import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { z } from "zod";

import { HomePage } from "@/app/HomePage";
import { NotFound } from "@/app/NotFound";
import { RouteError } from "@/app/RouteError";
import { useManageStore } from "@/app/stores/manage-store";

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: function Root() {
    return (
      <>
        <Outlet />
        <Toaster richColors position="top-center" />
      </>
    );
  },
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});

// "/?manage=<slug>&key=<edit key>" is the owner's private manage link. Live stores already
// have links with these exact names, so they are a public contract: keep them. Each param
// parses on its own, so a bad value drops only itself.
const homeSearchSchema = z.object({
  manage: z.string().trim().min(1).max(64).optional().catch(undefined),
  key: z.string().trim().min(1).max(128).optional().catch(undefined),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: homeSearchSchema,
  // Move the secret from the URL into the owner's browser storage, then drop it from the
  // address bar so it isn't left in history or shared by accident.
  beforeLoad: ({ search }) => {
    if (search.manage && search.key) {
      useManageStore.getState().setCreds({ slug: search.manage, key: search.key });
      // TanStack Router's redirect is thrown by design.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/", search: {}, replace: true });
    }
  },
  component: HomePage,
});

export const routeTree = rootRoute.addChildren([indexRoute]);

interface AppRouterOptions {
  queryClient: QueryClient;
  /** Memory history for tests; browser history by default. */
  history?: RouterHistory;
}

export function createAppRouter({ queryClient, history }: AppRouterOptions) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultErrorComponent: RouteError,
    ...(history ? { history } : {}),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
