import { useSyncExternalStore } from 'react';

/**
 * The brief highlight on a row a save just updated (#606): the primary
 * confirmation in a main flow, the toast only secondary. A write's success
 * names the row keys it changed (`flashRows`); a table reads the set
 * (`useFlashingRows`) and tints those rows for a moment.
 */
export const FLASH_MS = 1600;

let flashing: ReadonlySet<string> = new Set();
/** When each key's latest flash ends: a newer flash of a key extends it (#606 review). */
const until = new Map<string, number>();
const listeners = new Set<() => void>();

function set(next: ReadonlySet<string>) {
  flashing = next;
  for (const l of listeners) l();
}

/** Highlight these rows (by the key their table gives them) for `FLASH_MS`. */
export function flashRows(keys: readonly (string | null | undefined)[]): void {
  const added = keys.filter((k): k is string => !!k);
  if (added.length === 0) return;
  const ends = Date.now() + FLASH_MS;
  for (const k of added) until.set(k, ends);
  set(new Set([...flashing, ...added]));
  setTimeout(() => {
    const now = Date.now();
    const next = new Set(flashing);
    for (const k of added) {
      // Only the key's own latest flash ends it; an earlier timer leaves it lit.
      if ((until.get(k) ?? 0) <= now) {
        until.delete(k);
        next.delete(k);
      }
    }
    if (next.size !== flashing.size) set(next);
  }, FLASH_MS);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => flashing;

/** The row keys highlighted right now. */
export const useFlashingRows = (): ReadonlySet<string> =>
  useSyncExternalStore(subscribe, snapshot, snapshot);
