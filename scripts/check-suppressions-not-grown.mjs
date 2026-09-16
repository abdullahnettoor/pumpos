#!/usr/bin/env node
/**
 * Fail when a change grows the ESLint suppression baseline.
 *
 *   check-suppressions-not-grown.mjs <base-file> <head-file> [--allow-growth]
 *
 * `npm run lint` already fails on a NEW unsuppressed violation, but nothing
 * stopped the suppressions file itself growing — running `npm run lint:baseline`
 * and committing the result took the build green again (#78). That made the
 * count editable upward without anyone noticing, which is the same problem as
 * #75 by a different route: the number stops meaning what it appears to.
 *
 * Totals are compared, not file contents. Moving a suppression between files,
 * or fixing one and legitimately recording another, should not fail — only a
 * net increase should.
 *
 * A missing base file is treated as empty, so this behaves sensibly the first
 * time it runs and if the file is ever deleted.
 */
import { readFileSync, existsSync } from 'node:fs';

const [basePath, headPath, ...flags] = process.argv.slice(2);
if (!basePath || !headPath) {
  console.error('usage: check-suppressions-not-grown.mjs <base-file> <head-file> [--allow-growth]');
  process.exit(2);
}
const allowGrowth = flags.includes('--allow-growth');

/** @param {string} path @returns {Record<string, Record<string, {count: number}>>} */
function read(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Could not parse ${path}: ${/** @type {Error} */ (error).message}`);
    process.exit(2);
  }
}

/** Flatten to `file\u0000rule` -> count, plus the overall total. */
function tally(suppressions) {
  const byKey = new Map();
  const byRule = new Map();
  let total = 0;
  for (const [file, rules] of Object.entries(suppressions ?? {})) {
    for (const [rule, entry] of Object.entries(rules ?? {})) {
      const count = Number(entry?.count ?? 0);
      byKey.set(`${file}\u0000${rule}`, count);
      byRule.set(rule, (byRule.get(rule) ?? 0) + count);
      total += count;
    }
  }
  return { byKey, byRule, total };
}

const base = tally(read(basePath));
const head = tally(read(headPath));
const delta = head.total - base.total;

/** Per-entry increases, so the message points at what to look at. */
const grown = [];
for (const [key, count] of head.byKey) {
  const before = base.byKey.get(key) ?? 0;
  if (count > before) {
    const [file, rule] = key.split('\u0000');
    grown.push({ file, rule, before, after: count });
  }
}

if (delta > 0) {
  const verb = allowGrowth ? 'grew' : 'must not grow';
  console.error(
    `\nThe ESLint suppression baseline ${verb}: ${base.total} -> ${head.total} (+${delta}).\n`,
  );
  for (const { file, rule, before, after } of grown.sort((a, b) => b.after - a.after)) {
    console.error(`  ${file}`);
    console.error(`    ${rule}  ${before} -> ${after}`);
  }
  if (allowGrowth) {
    console.error(
      '\nAllowed: this pull request is marked [ratchet], so the increase is deliberate.\n',
    );
  } else {
    console.error(
      [
        '',
        'Suppressing a violation hides it from the only record of what is left.',
        'Fix the code instead, or move the suppression rather than adding to it.',
        '',
        'If the increase is genuinely justified, put [ratchet] in the pull request',
        'title. The check then passes and the reason stays visible in the history.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
} else if (delta < 0) {
  console.log(`ESLint suppression baseline shrank: ${base.total} -> ${head.total} (${delta}).`);
} else if (grown.length > 0) {
  // Same total, different distribution: a suppression moved. Worth saying so.
  console.log(
    `ESLint suppression baseline unchanged at ${head.total}, but ${grown.length} entr${
      grown.length === 1 ? 'y' : 'ies'
    } moved.`,
  );
} else {
  console.log(`ESLint suppression baseline unchanged at ${head.total}.`);
}
