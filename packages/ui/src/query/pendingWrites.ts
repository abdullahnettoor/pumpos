import { useMemo } from 'react';
import { useMutationState, type MutationKey } from '@tanstack/react-query';

/**
 * Rows read their "Saving…" state from the write itself (#606): the mutation
 * cache holds every write in flight with its variables, so a row finds its own
 * by key and identity, even after the drawer that sent it closed. No local
 * flags to keep in step.
 *
 * Only the latest write per identity counts. A write that succeeded drops out
 * (the row now shows the server's answer, step 1); one that failed stays as
 * `failed` with its error, so the row can say what went wrong, until the next
 * attempt replaces it. The planned outbox's "Waiting to sync" fits here as a
 * third state.
 */
export interface WriteEntry<V> {
  state: 'saving' | 'failed';
  variables: V;
  error: Error | null;
  /** When it was sent: across two kinds of write on one row, the later one wins. */
  submittedAt: number;
}

/** The later of two writes on the same row (either may be absent). */
export function latestOf(
  a: WriteEntry<unknown> | undefined,
  b: WriteEntry<unknown> | undefined,
): WriteEntry<unknown> | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.submittedAt >= a.submittedAt ? b : a;
}

/** A mutation as `useMutationState` selects it. */
export interface MutationSnapshot<V> {
  status: 'idle' | 'pending' | 'success' | 'error';
  variables: V | undefined;
  error: Error | null;
  submittedAt: number;
}

/**
 * The latest write per identity that is still saving or failed. `identify`
 * returns null for a write the caller does not show (another shift, another
 * station). Pure, for tests.
 */
export function latestWrites<V>(
  snapshots: readonly MutationSnapshot<V>[],
  identify: (variables: V) => string | null,
): Map<string, WriteEntry<V>> {
  const latest = new Map<string, MutationSnapshot<V>>();
  for (const s of snapshots) {
    if (s.variables === undefined) continue;
    const id = identify(s.variables);
    if (id === null) continue;
    const seen = latest.get(id);
    if (!seen || s.submittedAt >= seen.submittedAt) latest.set(id, s);
  }
  const out = new Map<string, WriteEntry<V>>();
  for (const [id, s] of latest) {
    const base = { variables: s.variables!, submittedAt: s.submittedAt };
    if (s.status === 'pending') out.set(id, { ...base, state: 'saving', error: null });
    else if (s.status === 'error') out.set(id, { ...base, state: 'failed', error: s.error });
  }
  return out;
}

/**
 * Writes under `mutationKey` still saving or failed. `identify` is a
 * module-level function (stable); `scope` is what it narrows by (a shift id, a
 * station id), so the result is recomputed only when the writes or the scope change.
 */
export function useWriteStates<V, S>(
  mutationKey: MutationKey,
  identify: (variables: V, scope: S) => string | null,
  scope: S,
): Map<string, WriteEntry<V>> {
  const snapshots = useMutationState({
    filters: { mutationKey },
    select: (m): MutationSnapshot<V> => ({
      status: m.state.status,
      variables: m.state.variables as V | undefined,
      error: m.state.error,
      submittedAt: m.state.submittedAt,
    }),
  });
  return useMemo(
    () => latestWrites(snapshots, (v: V) => identify(v, scope)),
    [snapshots, identify, scope],
  );
}
