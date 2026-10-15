import { hashKey, type QueryClient, type QueryFilters, type QueryKey } from '@tanstack/react-query';

/**
 * Writing a write's own answer into the cache (#606): "patch from the
 * response, then revalidate".
 *
 * A patch is a pure function from a cached payload to the next one, built only
 * from what the server returned (`query/patches/*.ts`). These two helpers apply
 * one through the shared client and remember that the entry was patched, so a
 * view can tell a figure the server has confirmed by a refetch from one it
 * cannot have patched (a shift-level total the write's answer does not carry).
 *
 * The caller starts the background revalidation right after, never awaiting
 * it (caching rule 6). Invalidating the same key straight after the patch also
 * cancels a refetch already in flight, so an answer from before the write
 * cannot land on top of the patch.
 */

/** When each patched entry was written: its `dataUpdatedAt` at the patch. */
const patchedAt = new Map<string, number>();

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
    const updatedAt = qc.getQueryState(queryKey)?.dataUpdatedAt;
    if (updatedAt !== undefined) patchedAt.set(hashKey(queryKey), updatedAt);
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
 * True while the entry still holds a patch the background refetch has not
 * replaced. A refetch always moves `dataUpdatedAt`, even when its answer is
 * structurally equal to the patch, so this never sticks.
 */
export function isAwaitingConfirmation(
  queryKey: QueryKey,
  dataUpdatedAt: number | undefined,
): boolean {
  return dataUpdatedAt !== undefined && patchedAt.get(hashKey(queryKey)) === dataUpdatedAt;
}
