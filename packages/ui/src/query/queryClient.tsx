import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

// Query-key prefixes whose data is safe to persist across reloads (static +
// semi-static tiers). Operational/live data and anything auth-related are never
// persisted. Bump CACHE_BUSTER on shape changes to drop stale persisted cache.
const PERSIST_PREFIXES = new Set(['tanks', 'products', 'customers', 'suppliers', 'expense-categories']);
const CACHE_BUSTER = 'v1';

/**
 * Shared QueryClient factory. App shells (web, desktop) create one client and
 * wrap their tree in {@link QueryProvider}; all data hooks in @pump/ui read from
 * this single cache. Defaults favour operator workflows: short stale time,
 * refetch on focus (a shift screen left open should catch new transactions),
 * and a single retry (the API is on a low-latency edge).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export interface QueryProviderProps {
  client?: QueryClient;
  children: React.ReactNode;
}

let fallbackClient: QueryClient | null = null;

/**
 * Persists the static/semi-static slices of the cache to localStorage so the
 * shell + dropdowns paint instantly on reload without a network wait. Called
 * once per client; no-op outside the browser (e.g. SSR / tests).
 */
function enablePersistence(client: QueryClient) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const persister = createSyncStoragePersister({ storage: window.localStorage, key: 'pumpos-rq-cache' });
  persistQueryClient({
    queryClient: client as any,
    persister,
    maxAge: 24 * 60 * 60_000,
    buster: CACHE_BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' && PERSIST_PREFIXES.has(String(query.queryKey?.[0])),
    },
  });
}

export const QueryProvider: React.FC<QueryProviderProps> = ({ client, children }) => {
  if (!client && !fallbackClient) {
    fallbackClient = createQueryClient();
  }
  const active = client ?? fallbackClient!;
  React.useEffect(() => {
    enablePersistence(active);
  }, [active]);
  return <QueryClientProvider client={active}>{children}</QueryClientProvider>;
};
