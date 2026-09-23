#!/usr/bin/env node
/**
 * Derive supabase/migrations from the drizzle chain.
 *
 * packages/db/migrations (drizzle journal) is the ONLY migration source. The
 * supabase/migrations folder is a build artifact: `supabase start` and the
 * integration suite replay it in filename order, so each journal entry is
 * emitted under a timestamp derived from its journal index. Drizzle's own
 * `0000_` names would sort wrongly against timestamped files (#269).
 *
 *   node scripts/sync-supabase-migrations.mjs          rewrite the folder
 *   node scripts/sync-supabase-migrations.mjs --check  exit 1 if it differs
 *
 * Output is a pure function of the journal and the SQL files, so it is
 * byte-stable across runs and machines.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.resolve(here, '../migrations');
const TARGET_DIR = path.resolve(here, '../../../supabase/migrations');

/** Fixed epoch; entry N is emitted N seconds after it. Never change this. */
const EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

function versionFor(idx) {
  const d = new Date(EPOCH_MS + idx * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

/** The files the folder should contain, as { name → contents }. */
export function expectedFiles() {
  const journal = JSON.parse(readFileSync(path.join(SOURCE_DIR, 'meta/_journal.json'), 'utf8'));
  const files = new Map();
  for (const { idx, tag } of journal.entries) {
    const name = `${versionFor(idx)}_${tag.replace(/^\d+_/, '')}.sql`;
    const body = readFileSync(path.join(SOURCE_DIR, `${tag}.sql`), 'utf8');
    const header =
      `-- DERIVED from packages/db/migrations/${tag}.sql by\n` +
      `-- \`npm run db:sync-supabase -w @pump/db\`. Edit the source, never this copy.\n\n`;
    files.set(name, header + body);
  }
  return files;
}

function sqlFilesIn(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sql')) : [];
}

function check() {
  const expected = expectedFiles();
  const problems = [];
  for (const f of sqlFilesIn(TARGET_DIR)) {
    if (!expected.has(f)) problems.push(`stray file (not derived from the journal): ${f}`);
  }
  for (const [name, body] of expected) {
    const target = path.join(TARGET_DIR, name);
    if (!existsSync(target)) problems.push(`missing: ${name}`);
    else if (readFileSync(target, 'utf8') !== body) problems.push(`differs from source: ${name}`);
  }
  if (problems.length) {
    console.error('supabase/migrations is out of sync with packages/db/migrations:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      '\nsupabase/migrations is derived; never edit it by hand. Run `npm run db:generate -w @pump/db`.',
    );
    process.exit(1);
  }
  console.log(`supabase/migrations in sync (${expected.size} files).`);
}

function write() {
  const expected = expectedFiles();
  mkdirSync(TARGET_DIR, { recursive: true });
  for (const f of sqlFilesIn(TARGET_DIR)) {
    if (!expected.has(f)) rmSync(path.join(TARGET_DIR, f));
  }
  for (const [name, body] of expected) writeFileSync(path.join(TARGET_DIR, name), body);
  console.log(`Wrote ${expected.size} files to supabase/migrations.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) check();
  else write();
}
