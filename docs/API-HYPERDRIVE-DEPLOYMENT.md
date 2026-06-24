# API + Hyperdrive Local Setup and Deployment

This runbook covers:
- Local development setup for the API Worker using Hyperdrive
- Production deployment of Hyperdrive and the API Worker

Linked Supabase project in this repository:
- Project ref: `sniubtppskopxkpznfkh`
- Source: `supabase/.temp/linked-project.json`

## 1. Local Development Setup

Prerequisites:
- Node.js installed
- Supabase CLI installed
- Project dependencies installed from repo root

There are two supported local dev modes:
- Remote Supabase (recommended for your current setup)
- Local Supabase via Docker

### 1.1 Configure local API secret

Create file: `apps/api/.dev.vars`

Add at least:

`SUPABASE_JWT_SECRET=replace-with-dev-jwt-secret`

Notes:
- This secret is required by Wrangler config.
- Do not commit `apps/api/.dev.vars`.

### 1.2 Remote Supabase mode (recommended)

Get your Supabase **direct** Postgres connection string (not pooler) from:
- Supabase Dashboard -> Project Settings -> Database -> Connection string (URI)
- Use host `db.<project-ref>.supabase.co` on port `5432`

Export it once in your shell:

`export DIRECT_DATABASE_URL="postgresql://postgres.<project-ref>:<PASSWORD>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"`

Start API using remote DB override:

`npm run dev:api`

What this does:
- Maps `DIRECT_DATABASE_URL` to `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`
- Runs `wrangler dev` locally while connecting directly to your remote Supabase DB

If `DIRECT_DATABASE_URL` is not set, the command will fall back to `apps/api/.dev.vars`, then the linked project’s `supabase/.temp/pooler-url` value.

### 1.3 Local Supabase Docker mode (optional)

Requires Docker daemon running.

Run from repo root:

`npx supabase start`

Default local DB in `apps/api/wrangler.toml`:
- Hyperdrive binding name: HYPERDRIVE
- localConnectionString: postgresql://postgres:postgres@127.0.0.1:54322/postgres

Optional override (takes precedence over localConnectionString):

`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://user:pass@host:5432/db`

### 1.4 Run API locally

From repo root:

- Remote Supabase mode: `npm run dev:api`
- Docker/local DB mode: `npm run dev:api:local`

Expected behavior:
- Wrangler starts successfully
- API uses Hyperdrive binding
- In local mode, Hyperdrive is bypassed and direct localConnectionString is used

## 2. Production Hyperdrive Setup

### 2.1 Create Hyperdrive

Use direct Postgres connection string (not pooled) from Supabase:

`npx wrangler hyperdrive create supabase-prod-pool --connection-string="postgresql://..."`

Capture the returned Hyperdrive id.

### 2.2 Update Worker binding

Edit `apps/api/wrangler.toml`:
- Replace id in [[hyperdrive]] with the real production Hyperdrive id

Keep localConnectionString for local development; it is ignored in production and remote dev.

### 2.3 Verify Hyperdrive config

`npx wrangler hyperdrive list`
`npx wrangler hyperdrive get <HYPERDRIVE_ID>`

## 3. Production API Deployment

### 3.1 Configure required secret

Set secret on Cloudflare Worker:

`npx wrangler secret put SUPABASE_JWT_SECRET`

### 3.2 Generate types after any Wrangler config change

From apps/api:

`npx wrangler types`

### 3.3 Deploy safely

From apps/api:

`npx wrangler deploy --dry-run`
`npx wrangler deploy`

### 3.4 Validate deployment

Use logs while testing endpoints:

`npx wrangler tail`

Check:
- GET /health
- Authenticated API routes under /api/*

## 4. Remote Dev Notes

wrangler dev --remote runs in Cloudflare network and uses deployed Hyperdrive config.
Use with caution because writes affect real connected databases.

## 5. Troubleshooting

Error: missing local Postgres connection string
- Ensure localConnectionString exists in wrangler.toml, or set:
  CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE

Error: missing DIRECT_DATABASE_URL in remote mode
- Export DIRECT_DATABASE_URL with your Supabase direct URI
- Run `npm run dev:api`

Error: failed to connect to local database (connection refused)
- Ensure Docker daemon is running
- Run: npx supabase start
- Confirm local database is reachable on 127.0.0.1:54322
- If using a different database, override with:
  CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE

Error: missing SUPABASE_JWT_SECRET
- Ensure apps/api/.dev.vars contains SUPABASE_JWT_SECRET for local
- Ensure wrangler secret is set for deployed environments

Error: Hyperdrive binding missing or misconfigured
- Confirm binding name is HYPERDRIVE in wrangler.toml
- Confirm production id is valid
- Re-run: npx wrangler types
