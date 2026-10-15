import type { Query, QueryClient, QueryFilters, QueryKey } from '@tanstack/react-query';

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
 * The patched entries: the Query itself (not its key) maps to its
 * `dataUpdateCount` at the patch (a count, not a clock: a refetch in the same
 * millisecond still moves it). Keyed weakly, so the mark lives exactly as
 * long as the entry: removing the query, garbage-collecting it or clearing the
 * client drops it, and a query re-created under the same key starts unmarked.
 */
const patchedAt = new WeakMap<Query, number>();

const findQuery = (qc: QueryClient, queryKey: QueryKey): Query | undefined =>
  qc.getQueryCache().find({ queryKey, exact: true });

/** A cache entry is patched only if it holds data; an absent one is left to the refetch. */
function patchOne<T>(qc: QueryClient, queryKey: QueryKey, patch: (data: T) => T): boolean {
  let changed = false;
  qc.setQueryData<T>(queryKey, (old) => {
    if (old === undefined) return old;
    const next = patch(old);
    changed = next !== old;
    return next;
  });
  if (changed) {
    const query = findQuery(qc, queryKey);
    if (query) patchedAt.set(query, query.state.dataUpdateCount);
  }
  return changed;
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
 * - `none`: no patch, or a refetch has since replaced it (confirmed). A
 *   refetch always moves `dataUpdateCount`, even when its answer equals the patch.
 * - `awaiting`: the patch is still what the entry holds, and no refetch has
 *   failed since (one may be in flight, or not started).
 * - `failed`: the refetch after the patch failed and no later one has
 *   succeeded. The figures the patch could not write are unconfirmed until a
 *   retry succeeds; a view keeps them as "Saving…" and offers Retry.
 */
export type PatchConfirmation = 'none' | 'awaiting' | 'failed';

export function patchConfirmation(qc: QueryClient, queryKey: QueryKey): PatchConfirmation {
  const query = findQuery(qc, queryKey);
  if (!query) return 'none';
  const at = patchedAt.get(query);
  if (at === undefined) return 'none';
  const { dataUpdateCount, status, fetchStatus } = query.state;
  if (dataUpdateCount !== at) {
    patchedAt.delete(query);
    return 'none';
  }
  // The patch set the entry to success; an error status now can only be a
  // refetch that failed after it. A retry in flight reads as awaiting again.
  return status === 'error' && fetchStatus === 'idle' ? 'failed' : 'awaiting';
}
