#!/usr/bin/env node
/**
 * Fail the build on inline `oxlint-disable` / `eslint-disable` comments for
 * React hook rules (`react-hooks/*`, or Oxlint's `react/rules-of-hooks`,
 * `react/exhaustive-deps` and the React Compiler rules).
 *
 * An inline disable hides a hook violation where no one reviews it (see #75).
 * Oxlint has no suppressions file, so the honest record of what is left is the
 * `lint` block in vite.config.ts: a hook that genuinely cannot satisfy a rule
 * gets a reviewed per-file override there, where it stays visible.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['packages', 'apps'];
const SKIP = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', 'src-tauri']);
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const HOOK_RULES = [
  'rules-of-hooks',
  'exhaustive-deps',
  'static-components',
  'use-memo',
  'preserve-manual-memoization',
  'incompatible-library',
  'immutability',
  'globals',
  'refs',
  'set-state-in-effect',
  'error-boundaries',
  'purity',
  'set-state-in-render',
  'unsupported-syntax',
];
const DISABLE = new RegExp(
  String.raw`(?:eslint|oxlint)-disable(?:-next-line|-line)?[^\n]*\b(?:react-hooks\/|react\/(?:${HOOK_RULES.join('|')})\b)`,
);

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, out);
    else if (SOURCE.test(entry)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const root of ROOTS) {
  for (const file of walk(root, [])) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (DISABLE.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`);
    });
  }
}

if (offenders.length > 0) {
  console.error(
    `\nFound ${offenders.length} inline lint disable comment(s) for React hook rules:\n`,
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  console.error(
    [
      '',
      'These hide a hook violation inline, where no one reviews it.',
      '',
      'Fix the hook, or — if it genuinely cannot satisfy the rule — add a reviewed',
      'per-file override to the `lint` block in vite.config.ts so it stays visible.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log('No inline React hook rule disables.');
