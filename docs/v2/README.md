# PumpOS v2 Engineering Documentation

The operating system for fuel retail. This folder is the **current source of truth**
for how PumpOS v2 is built. The specs in [`../initial/`](../initial/) are the original
v1 design documents — keep them for product/domain context, but where they conflict
with these v2 docs (especially **shift-centric vs business-day anchoring**), the v2
docs win. The root [`AGENTS.md`](../../AGENTS.md) is the short, authoritative rulebook.

## Read order

| Doc | What it covers |
|---|---|
| [architecture.md](architecture.md) | System overview, layers, anchoring model, request lifecycle, event/outbox flow |
| [backend-core-patterns.md](backend-core-patterns.md) | `packages/core` — capabilities, use-cases, ports, kernel, events, testing |
| [backend-api-patterns.md](backend-api-patterns.md) | `apps/api` — Hono routes, adapters, transactional outbox, guards, idempotency |
| [frontend-patterns.md](frontend-patterns.md) | `apps/web` + `packages/ui` — query layer, primitives, design system, navigation |
| [desktop-patterns.md](desktop-patterns.md) | `apps/desktop` — Tauri shell, web-first strategy, platform seams |
| [ui-assessment.md](ui-assessment.md) | Current UI gaps, design-quality review, refactor roadmap |
| [open-questions.md](open-questions.md) | Decisions still pending (prepaid top-up CMS, offline sync, double-entry) |

## The one rule that matters most

> **`business_day_id` is the universal anchor. `shift_id` is present if and only if
> the money touches the physical cash drawer.**

A shift is an operator-accountability window for drawer cash. Everything else
(card/UPI/bank collections, purchases, credit sales, bank/owner expenses) is
anchored to the **business day** with `shift_id = NULL`. Getting this wrong is the
single biggest source of modelling bugs. See [architecture.md](architecture.md).

## Monorepo map

```
packages/
  core/      @pump/core   — framework-agnostic domain (use-cases, ports, kernel). No Hono/Drizzle/React/SQL.
  db/        @pump/db     — Drizzle schema, migrations, postgres-js client (DbClient)
  shared/    @pump/shared — Zod schemas, types, permission guards, Result<T>/CoreError
  ui/        @pump/ui     — shared React components + cloud.ts HTTP service layer + query hooks + primitives
apps/
  api/       Hono on Cloudflare Workers (Hyperdrive → Supabase). Thin route adapters → core.
  web/       Vite + React shell consuming @pump/ui (the primary build target)
  desktop/   Tauri shell consuming @pump/ui (web-first; pulled to desktop later)
```

Dependency direction: `apps/* → @pump/ui / @pump/core → @pump/shared`. `@pump/core`
depends only on `@pump/shared` (+ zod). Adapters in `apps/api` inject Drizzle
implementations of the ports declared in `@pump/core`.

## Build, test, deploy

```bash
npx tsc -b                                   # composite build of the whole monorepo
npm run test --workspace=packages/core       # domain unit tests (deterministic, no DB)
npm run test --workspace=packages/shared     # schema + guard tests
npm run build --workspace=apps/web           # production web bundle
# End-to-end operational-loop smoke against the live DB (rolled back, nothing persists):
cd packages/db && set -a && . ./.env && set +a && node ../../apps/api/scripts/smoke-operational-loop.mjs
```

> **Deploy note:** `apps/web` consumes `@pump/ui` as **built `dist`** (no vite src
> alias). After editing `@pump/shared`, `@pump/core`, or `@pump/ui`, run `npx tsc -b`
> **and restart `npm run dev:web`** so vite picks up the rebuilt bundle. `apps/api`
> (`wrangler dev`) hot-reloads `apps/api/src` automatically.

## Database access (for debugging / smoke tests)

Credentials live in `packages/db/.env` (`DATABASE_URL` / `DIRECT_URL`). Source them
before running scripts:

```bash
cd packages/db && set -a && . ./.env && set +a && node -e "…postgres…"
```

Migrations are plain SQL in `packages/db/migrations/`. Apply them against the live DB
with a small postgres-js script (the worker connects via Hyperdrive at runtime).
