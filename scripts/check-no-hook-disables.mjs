#!/usr/bin/env node
/**
 * Fail the build on inline `eslint-disable` comments for `react-hooks/*`.
 *
 * ESLint here is a ratchet: pre-existing violations live in
 * eslint-suppressions.json, CI fails on new ones, and the number in that file
 * is the honest record of what is left. An inline disable bypasses all of that
 * — it is invisible to `--prune-suppressions`, so the file can read `{}` while
 * violations remain in the source. That is exactly the gap this check closes
 * (see #75), and the reason it is a separate check rather than a lint rule:
 * ESLint cannot be asked to police its own disable comments without a plugin.
 *
 * If a hook genuinely cannot satisfy the rule, record it in the suppressions
 * file with `npm run lint:baseline` so it stays counted.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['packages', 'apps'];
const SKIP = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', 'src-tauri']);
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const DISABLE = /eslint-disable(?:-next-line|-line)?[^\n]*\breact-hooks\//;

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
    `\nFound ${offenders.length} inline eslint-disable comment(s) for react-hooks rules:\n`,
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  console.error(
    [
      '',
      'These bypass the lint ratchet: `--prune-suppressions` cannot see them, so',
      'eslint-suppressions.json under-reports what is actually left.',
      '',
      'Fix the hook, or — if it genuinely cannot satisfy the rule — record it with',
      '`npm run lint:baseline` so it stays counted.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log('No inline react-hooks disables. The suppressions file is the whole picture.');
