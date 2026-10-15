import type { Query, QueryCache, QueryClient, QueryFilters, QueryKey } from '@tanstack/react-query';

/**
 * Writing a write's own answer into the cache (#606): "patch from the
 * response, then revalidate".
 *
 * A patch is a pure function from a cached payload to the next one, built only
 * from what the server returned (`query/patches/*.ts`). These helpers apply one
 * through the shared client and mark the cache entry as patched, so a view can
 * tell a figure the server has confirmed by a refetch from one a patch could
 * not write (a shift-level total the write's answer does not carry).
 *
 * The caller starts the background revalidation right after, never awaiting
 * it (caching rule 6). Invalidating the same key straight after the patch also
 * cancels a refetch already in flight, so an answer from before the write
 * cannot land on top of the patch.
 */

/**
 * The patched entries, keyed by the Query itself (not its key), so the mark
 * lives exactly as long as the entry: removing the query, garbage-collecting
 * it or clearing the client drops it, and a query re-created under the same
 * key starts unmarked.
 *
 * Only a successful **fetch** of the entry clears the mark (#606 review 2):
 * not another patch, not a rejected (no-op) patch, not any other
 * `setQueryData`. A cache listener per client watches for it.
 */
const patched = new WeakMap<Query, true>();
const watched = new WeakSet<QueryCache>();

function watch(qc: QueryClient) {
  const cache = qc.getQueryCache();
  if (watched.has(cache)) return;
  watched.add(cache);
  cache.subscribe((event) => {
    // A fetch's success is the only non-manual success: setQueryData is manual.
    if (event.type === 'updated' && event.action.type === 'success' && !event.action.manual) {
      patched.delete(event.query);
    }
  });
}

const findQuery = (qc: QueryClient, queryKey: QueryKey): Query | undefined =>
  qc.getQueryCache().find({ queryKey, exact: true });

/**
 * A cache entry is patched only if it holds data and the patch changes it. An
 * absent entry is left to the refetch; a patch that changes nothing (an older
 * answer the out-of-order guard rejects) is not written at all.
 */
function patchOne<T>(qc: QueryClient, queryKey: QueryKey, patch: (data: T) => T): boolean {
  const old = qc.getQueryData<T>(queryKey);
  if (old === undefined) return false;
  const next = patch(old);
  if (next === old) return false;
  watch(qc);
  qc.setQueryData<T>(queryKey, next);
  const query = findQuery(qc, queryKey);
  if (query) patched.set(query, true);
  return true;
}

/** Patches one cached query; returns whether anything changed. */
export function patchQueryData<T>(
  qc: QueryClient,
  queryKey: QueryKey,
  patch: (data: T) => T,
): boolean {
  return patchOne(qc, queryKey, patch);
}

/**
 * Patches every cached query matching the filters (a list cached per date
 * range, say). `patch` receives each entry's key so it can skip a range the
 * record does not fall in. Returns how many entries changed.
 */
export function patchQueriesData<T>(
  qc: QueryClient,
  filters: QueryFilters,
  patch: (data: T, queryKey: QueryKey) => T,
): number {
  let count = 0;
  for (const [queryKey] of qc.getQueriesData<T>(filters)) {
    if (patchOne<T>(qc, queryKey, (data) => patch(data, queryKey))) count += 1;
  }
  return count;
}

/**
 * Where a patched entry stands:
 * - `none`: no patch, or a successful fetch has since replaced it (confirmed),
 *   even one whose answer equals the patch.
 * - `awaiting`: the patch is still what the entry holds, and no refetch has
 *   failed since (one may be in flight, or not started).
 * - `failed`: the refetch after the patch failed and no later one has
 *   succeeded. The figures the patch could not write are unconfirmed until a
 *   retry succeeds; a view keeps them as "Saving…" and offers Retry.
 */
export type PatchConfirmation = 'none' | 'awaiting' | 'failed';

export function patchConfirmation(qc: QueryClient, queryKey: QueryKey): PatchConfirmation {
  const query = findQuery(qc, queryKey);
  if (!query || !patched.has(query)) return 'none';
  const { status, fetchStatus } = query.state;
  // A patch sets the entry to success; an error status now can only be a
  // refetch that failed after it. A retry in flight reads as awaiting again.
  return status === 'error' && fetchStatus === 'idle' ? 'failed' : 'awaiting';
}
