# PumpOS Engineering Documentation

This folder contains maintained implementation guidance, not an independent source
of product truth. The precedence order is:

1. [`AGENTS.md`](../../AGENTS.md) for hard architecture, security, and operational
   rules.
2. [`GLOSSARY.md`](../../GLOSSARY.md) for canonical domain language.
3. Accepted ADRs in [`docs/adr/`](../adr/) for decisions and their amendments.
4. These docs for implementation patterns, verified against current code and
   configuration. See the [documentation map](../README.md) for maintained,
   reference, and archived document groups.

Original design proposals live in [`docs/archive/initial-v1/`](../archive/initial-v1/)
for historical traceability only. They are not implementation guidance.

## Read order

| Doc                                                  | What it covers                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)                   | System overview, layers, anchoring model, request lifecycle, event/outbox flow      |
| [backend-core-patterns.md](backend-core-patterns.md) | `packages/core` — capabilities, use-cases, ports, kernel, events, testing           |
| [backend-api-patterns.md](backend-api-patterns.md)   | `apps/api` — Hono routes, adapters, transactional outbox, guards, idempotency       |
| [frontend-patterns.md](frontend-patterns.md)         | `apps/console` + `packages/ui` — query layer, primitives, design system, navigation |
| [desktop-patterns.md](desktop-patterns.md)           | `apps/desktop` — Tauri shell, native integrations, platform seams                   |
| [ui-assessment.md](ui-assessment.md)                 | Current UI gaps, design-quality review, refactor roadmap                            |
| [open-questions.md](open-questions.md)               | Decisions that remain unresolved or deferred                                        |

## The one rule that matters most

> **Forecourt records use Business Day; Office Records use Entry Date.** All Sales
> and Cash Drops also carry a Shift; purchases are Business-Day stock events.
> See [ADR 0005](../adr/0005-sales-day-vs-office-calendar-date.md) and
> [`AGENTS.md`](../../AGENTS.md) for the full rule.

A Shift is an attendant-accountability window for Drawer cash. Collections,
Supplier Payments, Expenses, Income, and bank work are Office Records: they use
station-timezone Entry Date and have no `shift_id` or `business_day_id`. Purchases
are forecourt stock events anchored to Business Day, not Shift. Drawer
reconciliation follows cash movement kind.

## Monorepo map

```
packages/
  core/      @pump/core   — framework-agnostic domain (use-cases, ports, kernel). No Hono/Drizzle/React/SQL.
  db/        @pump/db     — Drizzle schema, migrations, postgres-js client (DbClient)
  shared/    @pump/shared — Zod schemas, types, permission guards, Result<T>/CoreError
  ui/        @pump/ui     — shared React components + cloud.ts HTTP service layer + query hooks + primitives
apps/
  api/       Hono on Cloudflare Workers (Hyperdrive → Supabase). Thin route adapters → core.
  console/    Vite + React operational shell consuming @pump/ui
  mobile/     Attendant and supported mobile workflows
  marketing/  Public marketing and download site
  platform/   Internal organization administration surface
  desktop/    Tauri shell consuming @pump/ui with native integrations
```

Dependency direction: `apps/* → @pump/ui / @pump/core → @pump/shared`. `@pump/core`
depends only on `@pump/shared` (+ zod). Adapters in `apps/api` inject Drizzle
implementations of the ports declared in `@pump/core`.

## Build, test, deploy

```bash
npx tsc -b                                   # composite build of the whole monorepo
npm run test --workspace=packages/core       # domain unit tests (deterministic, no DB)
npm run test --workspace=packages/shared     # schema + guard tests
npm run build --workspace=apps/console         # production console bundle
# End-to-end operational-loop smoke against the live DB (rolled back, nothing persists):
cd packages/db && set -a && . ./.env && set +a && node ../../apps/api/scripts/smoke-operational-loop.mjs
```

> **Deploy note:** `apps/console` consumes `@pump/ui` as **built `dist`** (no Vite
> alias). After editing `@pump/shared`, `@pump/core`, or `@pump/ui`, run `npx tsc -b`
> **and restart the console dev server** so it picks up the rebuilt bundle. `apps/api`
> (`wrangler dev`) hot-reloads `apps/api/src` automatically.

## Database access (for debugging / smoke tests)

Credentials live in `packages/db/.env` (`DATABASE_URL` / `DIRECT_URL`). Source them
before running scripts:

```bash
cd packages/db && set -a && . ./.env && set +a && node -e "…postgres…"
```

Migrations live in `packages/db/migrations/` (see `packages/db/README.md`). Use
the documented migration commands; production database writes must follow the
approved release and migration workflow.
