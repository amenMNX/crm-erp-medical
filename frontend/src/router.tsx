import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Don't re-fetch on every window focus — most data doesn't change
        // that fast. Individual queries can override this where freshness
        // matters (e.g. permissions, notifications).
        refetchOnWindowFocus: false,

        // 2 minutes before data is considered stale.  Queries that need
        // shorter (permissions) or longer (static lists) TTLs set their own
        // staleTime explicitly.
        staleTime: 2 * 60 * 1000,

        // apiFetch already handles the 401→refresh→retry cycle internally,
        // so React Query's own retry layer would just add a second round of
        // identical failing requests.  Turn it off globally; queries that
        // genuinely need retries (transient network issues) can opt back in.
        retry: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};