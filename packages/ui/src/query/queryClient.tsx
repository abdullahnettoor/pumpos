import React from 'react';
import { clearNavIntent } from '../nav-intent/store.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/query-persist-client-core';
import { runTask } from '../utils/runTask.js';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { isResourceLimitError } from '../services/cloud.js';

// Query-key prefixes whose data is safe to persist across reloads (static +
// semi-static tiers). Operational/live data and anything auth-related are never
// persisted. Bump CACHE_BUSTER on shape changes to drop stale persisted cache.
const PERSIST_PREFIXES = new Set([
  'tanks',
  'products',
  'customers',
  'suppliers',
  'expense-categories',
  'stations',
  'dispensers',
  'nozzles',
  'users',
  'shift-templates',
  'payment-terminals',
  'pricing',
  'organization',
]);
// Bump to invalidate all persisted client caches on next load. v3 drops stale
// empty `stations` lists cached while a user briefly resolved to a wrong/empty
// org (Phase A duplicate-auth-user bug).
const CACHE_BUSTER = 'v3';

/** localStorage key the persisted static/semi cache is written to. */
export const PERSISTED_QUERY_CACHE_KEY = 'pumpos-rq-cache';

/**
 * Wipe the persisted query cache from localStorage. Call on logout / user switch
 * so one user's cached stations/products/customers never bleed into the next
 * session (which otherwise surfaces stale data and "station not found" errors).
 */
export function clearPersistedQueryCache() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(PERSISTED_QUERY_CACHE_KEY);
}

/**
 * localStorage prefix shared by all resilience drafts (pending Tank Dips,
 * Stock Counts, Handover request identities). Keeping one prefix lets logout
 * wipe every pending workflow without enumerating each feature's keys.
 */
export const PENDING_WORKFLOW_KEY_PREFIX = 'pumpos:pending-';

/**
 * Remove every pending-workflow draft (Tank Dip, Stock Count, Handover) from
 * localStorage. Call on logout / account switch so one user's queued drafts
 * never leak into — or get submitted by — the next session on this device.
 */
export function clearPendingWorkflowKeys() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const doomed: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(PENDING_WORKFLOW_KEY_PREFIX)) doomed.push(key);
  }
  for (const key of doomed) window.localStorage.removeItem(key);
}

/**
 * Full client-side cleanup for logout / account switch: in-memory query cache,
 * persisted static/semi cache, and all pending workflow drafts.
 */
export function clearClientSessionData(qc: QueryClient) {
  qc.clear();
  clearPersistedQueryCache();
  clearPendingWorkflowKeys();
  // The nav-intent store is module-global, so an unconsumed deep link would
  // otherwise outlive the session and fire for the next user who signs in.
  clearNavIntent();
}

/**
 * Query retry policy: one retry for transient failures (network blips, 5xx
 * from infra), but NEVER for Cloudflare resource-limit terminations — retrying
 * those re-runs the same over-budget work and amplifies load (#148 / #113).
 * Exported for tests.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isResourceLimitError(error)) return false;
  return failureCount < 1;
}

/**
 * Shared QueryClient factory. App shells (web, desktop) create one client and
 * wrap their tree in {@link QueryProvider}; all data hooks in @pump/ui read from
 * this single cache. Defaults favour operator workflows: short stale time,
 * refetch on focus (a shift screen left open should catch new transactions),
 * and a single retry (the API is on a low-latency edge) — except resource-limit
 * failures, which are never retried.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: shouldRetryQuery,
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
 * The client used when a shell does not pass one in. Created on first use and
 * shared thereafter, so every consumer sees one cache.
 *
 * Lazily created from a function rather than assigned during render: mutating
 * module state while rendering is not safe under concurrent React, where a
 * render can be started and thrown away.
 */
function getFallbackClient(): QueryClient {
  fallbackClient ??= createQueryClient();
  return fallbackClient;
}

/**
 * Persists the static/semi-static slices of the cache to localStorage so the
 * shell + dropdowns paint instantly on reload without a network wait. Called
 * once per client; no-op outside the browser (e.g. SSR / tests).
 */
function enablePersistence(client: QueryClient) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: PERSISTED_QUERY_CACHE_KEY,
  });
  const [, restored] = persistQueryClient({
    queryClient: client,
    persister,
    maxAge: 24 * 60 * 60_000,
    buster: CACHE_BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' && PERSIST_PREFIXES.has(String(query.queryKey?.[0])),
    },
  });

  // Restoring reads and parses localStorage, so it can reject on a corrupt or
  // truncated payload (a half-written entry, or a quota failure mid-write).
  // That must not take the app down: the cache is a paint-speed optimisation,
  // not a source of truth, so drop the bad payload and carry on fetching from
  // the network. Deliberately not surfaced to the operator — there is nothing
  // for them to do, and the only visible effect is a slower first paint.
  runTask(restored, (error) => {
    console.error('Could not restore the persisted query cache; continuing without it.', error);
    try {
      window.localStorage.removeItem(PERSISTED_QUERY_CACHE_KEY);
    } catch {
      // Storage is unavailable (private mode, quota). Nothing further to do.
    }
  });
}

export const QueryProvider: React.FC<QueryProviderProps> = ({ client, children }) => {
  // useState's initialiser runs once per mount and, unlike a bare assignment,
  // is not a render-phase mutation of module scope.
  const [fallback] = React.useState(() => (client ? null : getFallbackClient()));
  const active = client ?? fallback!;
  React.useEffect(() => {
    enablePersistence(active);
  }, [active]);
  return <QueryClientProvider client={active}>{children}</QueryClientProvider>;
};
