#!/usr/bin/env node
/**
 * Fail the build on code patterns that past reviews kept flagging by hand:
 * UTC-sliced dates, inline role checks, awaited cache invalidation, inline
 * query keys, local number/date formatting, and copies of the API result
 * sender. Each rule names the shared helper to use instead.
 *
 * Existing occurrences are recorded per file in
 * scripts/domain-patterns-baseline.json, so the count can only go down:
 *   - a file with MORE matches than its baseline fails (new violation);
 *   - a file with FEWER matches fails until the baseline is tightened with
 *     `node scripts/check-domain-patterns.mjs --update-baseline`.
 *
 * A genuine exception takes `// domain-allow: <rule-id> <reason>` on the same
 * line or the line above.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT =
  process.env.DOMAIN_PATTERNS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts', 'domain-patterns-baseline.json');
const SKIP = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'src-tauri',
  '__tests__',
  '__integration__',
]);
const SOURCE = /\.(ts|tsx)$/;
const TEST = /\.(test|spec)\.(ts|tsx)$/;
const UI_DIRS = ['packages/ui/src', 'apps/desktop/src', 'apps/mobile/src', 'apps/console/src'];

/** @type {{ id: string, dirs: string[], except?: string[], pattern: RegExp, fix: string }[]} */
const RULES = [
  {
    id: 'utc-date-slice',
    dirs: ['packages/core/src', 'packages/shared/src', 'apps/api/src', ...UI_DIRS],
    except: ['packages/shared/src/utils/business-date.ts'],
    pattern:
      /toISOString\(\)\s*\.\s*(slice\(\s*0\s*,\s*10\s*\)|split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\])/,
    fix: 'A UTC slice ignores the station timezone and Day Start. Use resolveBusinessDate / resolveEntryDate (now) or shiftBusinessDate (date arithmetic) from @pump/shared.',
  },
  {
    id: 'role-literal',
    dirs: UI_DIRS,
    pattern:
      /[!=]==?\s*['"](Owner|Manager|Accountant|Staff|Attendant)['"]|['"](Owner|Manager|Accountant|Staff|Attendant)['"]\s*[!=]==?/,
    fix: 'Ask a guard or permission from @pump/shared (permissions/guards.ts) instead of comparing role names.',
  },
  {
    id: 'awaited-invalidation',
    dirs: UI_DIRS,
    pattern: /await\s+(?:[\w.]+\.)?invalidate\w*\(/,
    fix: 'Start invalidation without awaiting it (runTask / void). See .agents/skills/pump-data-caching.',
  },
  {
    id: 'inline-query-key',
    dirs: UI_DIRS,
    except: ['packages/ui/src/query/hooks.ts'],
    pattern: /queryKey:\s*\[\s*['"`]/,
    fix: 'Add the key to queryKeys in packages/ui/src/query/hooks.ts and use it.',
  },
  {
    id: 'local-format',
    dirs: UI_DIRS,
    except: ['packages/ui/src/utils/format.ts'],
    pattern: /\.toFixed\(|\.toLocaleString\(|new Intl\.(NumberFormat|DateTimeFormat)\(/,
    fix: 'Format money, quantities and dates with packages/ui/src/utils/format.ts (add a helper there if one is missing).',
  },
  {
    id: 'local-send-result',
    dirs: ['apps/api/src'],
    except: ['apps/api/src/infra/send-result.ts'],
    pattern: /\b(?:const|function)\s+(?:STATUS_BY_CODE|sendResult)\b/,
    fix: 'Import sendResult / STATUS_BY_CODE from apps/api/src/infra/send-result.ts.',
  },
];

const COMMENT = /^\s*(\/\/|\*|\/\*)/;

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
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(entry) && !TEST.test(entry)) out.push(full);
  }
  return out;
}

/** @returns {Record<string, Record<string, { line: number, text: string }[]>>} */
function scan() {
  /** @type {Record<string, Record<string, { line: number, text: string }[]>>} */
  const found = {};
  for (const rule of RULES) {
    found[rule.id] = {};
    for (const dir of rule.dirs) {
      for (const file of walk(join(ROOT, dir), [])) {
        const rel = relative(ROOT, file).split('\\').join('/');
        if (rule.except?.includes(rel)) continue;
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((text, i) => {
          if (COMMENT.test(text) || !rule.pattern.test(text)) return;
          const allow = `domain-allow: ${rule.id}`;
          if (text.includes(allow) || (lines[i - 1] ?? '').includes(allow)) return;
          (found[rule.id][rel] ??= []).push({ line: i + 1, text: text.trim() });
        });
      }
    }
  }
  return found;
}

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE, 'utf8'));
  } catch {
    return {};
  }
}

function toBaseline(found) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const [id, files] of Object.entries(found)) {
    out[id] = {};
    for (const file of Object.keys(files).sort()) out[id][file] = files[file].length;
  }
  return out;
}

const found = scan();

if (process.argv.includes('--update-baseline')) {
  writeFileSync(BASELINE, `${JSON.stringify(toBaseline(found), null, 2)}\n`);
  console.log(`Wrote ${relative(ROOT, BASELINE)}.`);
  process.exit(0);
}

const baseline = readBaseline();
const grown = [];
const shrunk = [];
for (const rule of RULES) {
  const files = found[rule.id];
  const base = baseline[rule.id] ?? {};
  for (const [file, hits] of Object.entries(files)) {
    if (hits.length > (base[file] ?? 0)) grown.push({ rule, file, hits, allowed: base[file] ?? 0 });
  }
  for (const [file, count] of Object.entries(base)) {
    if ((files[file]?.length ?? 0) < count) shrunk.push(`${rule.id}  ${file}`);
  }
}

if (grown.length > 0) {
  console.error('\nNew domain-pattern violations:\n');
  for (const { rule, file, hits, allowed } of grown) {
    console.error(`  [${rule.id}] ${file}  (${hits.length} found, baseline ${allowed})`);
    for (const hit of hits) console.error(`    ${file}:${hit.line}  ${hit.text}`);
    console.error(`    → ${rule.fix}\n`);
  }
  console.error(
    'Fix the new lines. A genuine exception takes `// domain-allow: <rule-id> <reason>`.\n',
  );
  process.exit(1);
}

if (shrunk.length > 0) {
  console.error('\nFewer violations than the baseline records (good). Tighten it:\n');
  for (const entry of shrunk) console.error(`  ${entry}`);
  console.error('\n  node scripts/check-domain-patterns.mjs --update-baseline\n');
  process.exit(1);
}

console.log('No new domain-pattern violations.');
