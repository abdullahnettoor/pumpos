/**
 * Ratchet over the style-check counts (#517).
 *
 * The allow-list records today's violations as `rule → file → count`. A file
 * may never gain violations, a file not on the list may have none, and a file
 * that now has fewer than its entry fails until the entry is lowered, so the
 * list only ever shrinks.
 */
import type { Rule } from './scan.js';

export type Counts = Partial<Record<Rule, Record<string, number>>>;

export interface RatchetProblem {
  rule: Rule;
  file: string;
  allowed: number;
  actual: number;
}

function keys(a: Counts, b: Counts): Rule[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort() as Rule[];
}

/** Every file whose count differs from its entry (missing entry = 0). */
export function compareToAllowList(actual: Counts, allowed: Counts): RatchetProblem[] {
  const out: RatchetProblem[] = [];
  for (const rule of keys(actual, allowed)) {
    const a = actual[rule] ?? {};
    const l = allowed[rule] ?? {};
    for (const file of [...new Set([...Object.keys(a), ...Object.keys(l)])].sort()) {
      const n = a[file] ?? 0;
      const max = l[file] ?? 0;
      if (n !== max) out.push({ rule, file, allowed: max, actual: n });
    }
  }
  return out;
}

/**
 * The allow-list with every entry lowered to the actual count. Never raises
 * an entry and never adds one: a new violation has to be fixed, not listed.
 * Zero entries and empty rules are dropped; keys are sorted for stable diffs.
 */
export function lowerAllowList(actual: Counts, allowed: Counts): Counts {
  const out: Counts = {};
  for (const rule of Object.keys(allowed).sort() as Rule[]) {
    const entries: Record<string, number> = {};
    const a = actual[rule] ?? {};
    for (const [file, max] of Object.entries(allowed[rule] ?? {}).sort(([x], [y]) =>
      x.localeCompare(y),
    )) {
      const n = Math.min(a[file] ?? 0, max);
      if (n > 0) entries[file] = n;
    }
    if (Object.keys(entries).length) out[rule] = entries;
  }
  return out;
}
