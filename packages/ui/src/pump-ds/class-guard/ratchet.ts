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

function rulesOf(actual: Counts, allowed: Counts): Rule[] {
  return [...new Set([...Object.keys(actual), ...Object.keys(allowed)])].sort() as Rule[];
}

/** Every file whose count differs from its entry (missing entry = 0). */
export function compareToAllowList(actual: Counts, allowed: Counts): RatchetProblem[] {
  const out: RatchetProblem[] = [];
  for (const rule of rulesOf(actual, allowed)) {
    const actualByFile = actual[rule] ?? {};
    const allowedByFile = allowed[rule] ?? {};
    const files = new Set([...Object.keys(actualByFile), ...Object.keys(allowedByFile)]);
    for (const file of [...files].sort()) {
      const count = actualByFile[file] ?? 0;
      const max = allowedByFile[file] ?? 0;
      if (count !== max) out.push({ rule, file, allowed: max, actual: count });
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
    const actualByFile = actual[rule] ?? {};
    for (const [file, max] of Object.entries(allowed[rule] ?? {}).sort(([x], [y]) =>
      x.localeCompare(y),
    )) {
      const lowered = Math.min(actualByFile[file] ?? 0, max);
      if (lowered > 0) entries[file] = lowered;
    }
    if (Object.keys(entries).length) out[rule] = entries;
  }
  return out;
}
