# @pump/db

Drizzle schema, client, and the migration chain for PumpOS.

## Migrations: one source

```text
src/schema.ts                  declarative schema (tables, FKs, checks, indexes)
        │  npm run db:generate
        ▼
migrations/                    THE migration source (drizzle journal)
  0000_baseline.sql            generated from schema.ts
  0001_rls_and_triggers.sql    custom: auth shim, provisioning triggers, RLS
  meta/                        journal + snapshots (never hand-edit)
        │  npm run db:sync-supabase   (runs inside db:generate)
        ▼
../../supabase/migrations/     DERIVED copy for `supabase start` and the
                               integration suite; never edit by hand
```

`drizzle-kit migrate` (the `DB migrate` workflow) applies `migrations/` to real
databases. `supabase/migrations` carries the same SQL under timestamp names
(`20260101000000 + journal idx seconds`) so filename order equals journal order.

### The one workflow

| Change                                         | Command                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Table / column / index / FK / check            | edit `src/schema.ts`, then `npm run db:generate -w @pump/db`                                                   |
| RLS policy, trigger, function, grant, backfill | `npm run db:generate:custom -w @pump/db -- <name>`, write the SQL, then `npm run db:sync-supabase -w @pump/db` |
| Verify (CI runs this too)                      | `npx tsc -b && npm run db:check -w @pump/db`                                                                   |

Commit `schema.ts`, `migrations/**`, and `supabase/migrations/**` together. To
change a generated migration, change `schema.ts` and regenerate.

### What `db:check` catches

- `schema.ts` changed without a migration.
- A generated migration edited after generation. Each one is regenerated
  from its snapshots and compared statement by statement. A migration whose
  snapshots are identical is `--custom` and is exempt.
- A `migrations/*.sql` file missing from the journal (it would never ship).
- `supabase/migrations` differing from its derivation (a hand-written or
  stale file).
- With `CHAIN_CHECK_DATABASE_URL` set, the chain applied to a fresh throwaway
  database through drizzle's migrator.

CI also replays `supabase/migrations` into an empty Postgres and runs
`supabase/tests/rls_tenancy.test.sql`, which fails if any `public` table lacks
row level security.

## Re-baseline (#271): recreate, don't migrate

The chain was collapsed to two files on 2026-09-23, before any production
database existed. **Every database provisioned from the old chain is
orphaned**: its `drizzle.__drizzle_migrations` rows name migrations that no
longer exist, so `drizzle-kit migrate` would try to re-create every table.
Recreate it instead:

```sh
# 1. Wipe (DESTROYS ALL DATA): public schema objects, drizzle bookkeeping,
#    the auth.users triggers, and auth users.
psql "$DIRECT_DATABASE_URL" <<'SQL'
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_invited ON auth.users;
DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
DELETE FROM auth.users;
SQL

# 2. Provision from the chain, then seed.
DIRECT_DATABASE_URL=… npm run db:migrate -w @pump/db
npx tsc -b && DIRECT_DATABASE_URL=… npm run db:seed -w @pump/db
```

The grants in step 1 restore what a new Supabase project gives `public`; RLS
(from `0001`) is what keeps tenant roles out of the rows. A local
`supabase start` database needs only `supabase db reset`.

Recover old SQL from git history: `git show <sha>:packages/db/migrations/…`.
