#!/usr/bin/env node
/**
 * Scaffold a `--custom` migration (RLS, triggers, functions: SQL the schema
 * cannot declare) and keep supabase/migrations derived.
 *
 *   npm run db:generate:custom -w @pump/db -- <name>
 *
 * Write the SQL into the new file, then run `npm run db:sync-supabase -w @pump/db`
 * again so the derived copy carries it.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error('Usage: npm run db:generate:custom -w @pump/db -- <snake_case_name>');
  process.exit(2);
}
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
run('npx', ['drizzle-kit', 'generate', '--custom', `--name=${name}`]);
run('node', ['scripts/sync-supabase-migrations.mjs']);
console.log(
  '\nNow write the SQL into the new migrations/*.sql file, then run' +
    ' `npm run db:sync-supabase -w @pump/db`.',
);
