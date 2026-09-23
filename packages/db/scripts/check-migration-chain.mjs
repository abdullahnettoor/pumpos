#!/usr/bin/env node
/**
 * Guard the migration chain against the drift behind #268.
 *
 * packages/db/migrations is the single migration source. Three ways it can
 * silently diverge from what actually ships, and the check for each:
 *
 *   1. schema.ts changed, no migration generated.
 *      → schema.ts diffed against the latest snapshot must be empty.
 *        (The same comparison `drizzle-kit generate` makes.)
 *
 *   2. A generated migration's SQL was hand-edited (the 0008 failure: SQL
 *      pruned, snapshot kept the columns, so `generate` still said no-op).
 *      → every journal entry whose snapshots differ is regenerated from
 *        (previous snapshot → its snapshot) and must equal its SQL file,
 *        statement by statement. Entries whose snapshots do not differ are
 *        `--custom` migrations (RLS, triggers, functions) and are hand-written
 *        by design.
 *
 *   3. SQL files that the journal does not know about.
 *      → drizzle-kit ignores them; they would never ship. Fail.
 *
 * With CHAIN_CHECK_DATABASE_URL set it also applies the chain to a fresh,
 * throwaway database through drizzle's migrator (the code path of
 * `drizzle-kit migrate`), proving a clean provision works. The role must be
 * allowed to CREATE DATABASE; nothing existing is touched.
 *
 *   npm run db:check -w @pump/db
 *
 * Needs the package built (`npx tsc -b`): schema.ts is read from dist/.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import * as schema from '../dist/schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(here, '../migrations');

const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, 'meta/_journal.json'), 'utf8'));
const snapshot = (idx) =>
  JSON.parse(
    readFileSync(
      path.join(MIGRATIONS, `meta/${String(idx).padStart(4, '0')}_snapshot.json`),
      'utf8',
    ),
  );
const statementsOf = (sqlText) =>
  sqlText
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

/** The state before the first migration: an empty database. */
const EMPTY = {
  id: '00000000-0000-0000-0000-000000000000',
  prevId: '',
  version: '7',
  dialect: 'postgresql',
  tables: {},
  enums: {},
  schemas: {},
  sequences: {},
  roles: {},
  policies: {},
  views: {},
  _meta: { schemas: {}, tables: {}, columns: {} },
};

const failures = [];

// 3. Stray SQL files.
const journaled = new Set(journal.entries.map((e) => `${e.tag}.sql`));
for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
  if (!journaled.has(f)) failures.push(`${f} is not in meta/_journal.json, so it never ships.`);
}

// 2. Each generated migration equals its regeneration.
for (const { idx, tag } of journal.entries) {
  const prev = idx === 0 ? EMPTY : snapshot(idx - 1);
  const expected = (await generateMigration(prev, snapshot(idx))).map((s) => s.trim());
  if (expected.length === 0) continue; // --custom migration: hand-written by design
  const actual = statementsOf(readFileSync(path.join(MIGRATIONS, `${tag}.sql`), 'utf8'));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    const at = expected.findIndex((s, i) => s !== actual[i]);
    const i = at === -1 ? expected.length : at;
    const want = (expected[i] ?? '<end of file>').split('\n');
    const got = (actual[i] ?? '<end of file>').split('\n');
    const line = Math.max(
      0,
      want.findIndex((l, k) => l !== got[k]),
    );
    failures.push(
      `${tag}.sql was edited after generation (statement ${i + 1}).\n` +
        `      expected: ${want[line]?.trim() ?? '<nothing>'}\n` +
        `      found:    ${got[line]?.trim() ?? '<nothing>'}`,
    );
  }
}

// 1. schema.ts has no ungenerated changes.
const latest = snapshot(journal.entries.at(-1).idx);
const pending = await generateMigration(latest, generateDrizzleJson(schema, latest.id));
if (pending.length) {
  failures.push(
    `src/schema.ts has ${pending.length} change(s) with no migration, e.g.:\n      ${pending[0].split('\n')[0]}`,
  );
}

if (failures.length) {
  console.error('Migration chain check FAILED:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    '\nFix: change src/schema.ts, then `npm run db:generate -w @pump/db`. Never hand-edit a' +
      ' generated migration; regenerate it. Triggers/RLS/functions go in' +
      ' `npx drizzle-kit generate --custom --name <name>`.',
  );
  process.exit(1);
}
console.log(`Migration chain consistent (${journal.entries.length} journaled migrations).`);

if (process.env.CHAIN_CHECK_DATABASE_URL)
  await applyToFreshDatabase(process.env.CHAIN_CHECK_DATABASE_URL);

async function applyToFreshDatabase(url) {
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const name = `chain_check_${process.pid}_${Date.now()}`;
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  let ok = false;
  try {
    await admin.unsafe(`create database ${name}`);
    const target = new URL(url);
    target.pathname = `/${name}`;
    const sql = postgres(target.toString(), { max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS });
      ok = true;
    } finally {
      await sql.end();
    }
  } catch (error) {
    console.error('Migration chain failed to apply to a fresh database:\n', error);
  } finally {
    await admin.unsafe(`drop database if exists ${name} with (force)`).catch(() => undefined);
    await admin.end();
  }
  if (!ok) process.exit(1);
  console.log('Migration chain applies cleanly to a fresh database.');
}
