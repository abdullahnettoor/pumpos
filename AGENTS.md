# PumpOS

Multi-tenant fuel station management for Indian stations. "The operating system
for fuel retail." Not a POS, not an accounting package.

Goals: operational simplicity · graceful degradation (not offline-first) ·
auditability · tenant isolation · fast desktop.

Rules here bind every agent and contributor. Architecture beats convenience:
if a change conflicts with the domain model, events, schema, permissions or
design system, stop and revisit before coding.

# Domain

Language: `GLOSSARY.md`. Decisions: `docs/adr/`. Operator flows:
`docs/USER-FLOW.md` (verify against the current UI).

## Anchoring (ADR 0005, 0007)

Pick the anchor first; it is the most important domain rule.

- **Forecourt → `business_day_id` (+ `shift_id`).** The Business Day is the
  station's sales day: starts at the onboarding Day Start, runs 24h. All sales
  (fuel, product, credit, incl. their card/UPI method) and cash drops sit in a
  shift.
- **Office → entry date only.** Collections (any method, even at a pump
  terminal), supplier payments, expenses, income, bank work. Station-timezone
  calendar date, no shift, no business day; they live in the ledger. Test: "is
  this paying for fuel or products right now?", not "which machine?".
- **Product Purchase** → `business_day_id`, no shift. **Fuel Purchase** is an
  Office Record (no stock); fuel stock comes only from **Decantation**
  (`business_day_id`, no shift). Paying a purchase is a separate supplier
  payment.
- **Credit sale** = customer-ledger debit (receivable), never drawer cash, never
  a second stock move. Customer balance = Σ credit sales − Σ collections.

```text
Business Day → Shift(s) → Operations → Shift Summary (on shift close) → DSR (on day close) → Reports
```

## Drawers (ADR 0005, #287)

Each Attendant/DU has a Drawer with an Opening Float
(`shift_staff_assignments.opening_float`), reconciled at Handover. Every Drawer
hands over before the shift closes.

```text
drawer.expectedCash = openingFloat + DU cash sales − cashDrops        (Handover)
attendantVariance   = Σ (declared + drops − drawer.expectedCash)       (Handover)
expectedDrawerCash  = Σ declared − unassigned drops at close           (office)
officeCountVariance = counted − expectedDrawerCash                     (shift close)
```

Helpers: `expectedShiftDrawerCash`, `computeShiftCloseCash`. Shift opening cash
is not stored (= Σ Opening Floats). Ledger gets only cash received (Σ declared
cash sales, floats excluded); attendant shortages are not posted. A drop at
close names its Drawer; one naming none goes to office variance. Cash moved
after close is an office transfer (Cash in Hand `CASH_IN_HAND` → Safe/Bank) by
Entry Date. Card/UPI/bank/credit never enter drawer reconciliation.

## Business date

- Keyed by `(station, date)` (`business_days_org_station_date_uniq`), opened
  lazily by the first shift or sale. Many may be open; any past day closes
  independently and never blocks today.
- `business_date` is `varchar(10)` `YYYY-MM-DD`; audit timestamps stay UTC.
- Resolve with `resolveBusinessDate({ now, timeZone, dayStartsAt })` (rolls back
  before Day Start), `resolveEntryDate` for office records, `shiftBusinessDate`
  for date arithmetic — all `@pump/shared`. Never
  `new Date().toISOString().slice(0,10)` (lint-enforced).
- Station `timezone` + `business_day_starts_at` live in `stations.settings`;
  the API loads them with `loadStationClock` into
  `ExecutionContext.timeZone` / `.businessDayStartsAt`.

## Sales, reports, variance

- **Fuel sales** derive from nozzle readings: closing − opening; opening
  defaults to the previous closing. Never manual entries.
- **Product sales** (engine oil, coolant, grease, accessories) are separate.
- **Shift Summary** (`shift_summaries`, on shift close) and **DSR**
  (`dssr_snapshots`, on day close; sales-only — office records live in the
  Daily Cash Book) are immutable: stored forever, never recalculated;
  regeneration is explicit and idempotent. Snapshots grow additively (ADR 0010).
- **Variance** is first-class: expected, actual, variance, reason. Never hidden
  inside a report.
- Reports come from snapshots, events and operational records — never UI
  calculations.

# Architecture

- **Ports & adapters.** `packages/core` (`@pump/core`): framework-free
  use-cases per capability (`station-setup`, `station-ops`, `inventory`,
  `retail`, `purchasing`, `crm`, `finance`, `reporting`) and repository ports;
  never imports Hono, Drizzle, React or SQL. `apps/api`: thin Hono routes
  wiring Drizzle adapters into use-cases.
- **Transactional outbox.** Mutations run in
  `runInTransaction(db, (tx, events) => useCase.execute(...))`; state and
  events commit together.
- **Envelope**: `{ success: true, data }` / `{ success: false, error: { code, message } }`.
- **Idempotency**: mutating routes honour `Idempotency-Key`
  (`idempotency_keys`).
- **Events**: every meaningful action emits one (`SHIFT_OPENED`,
  `SALE_RECORDED`, …) carrying `event_id`, `event_type`, `organization_id`,
  `station_id`, `entity_type`, `entity_id`. Replays must be safe. Never bypass.
- **Cloud authoritative**: Supabase Postgres is the source of truth. Target is
  Level 2 resilience (online-primary, graceful degradation;
  `docs/roadmap/phase-O-offline-sync.md`). The client write outbox (Tauri
  SQLite / IndexedDB) is planned, not shipped: `navigator.onLine` is not proof
  a write is queued. When built: never block a core operator action on
  connectivity; optimistic apply → durable outbox → idempotent replay. Desktop
  bundles its UI locally; mobile is online-only.

# Data

- UUID ids everywhere; document numbers (`SAL-000123`) are never ids.
- Soft delete (`is_active`, `archived_at`); keep history.
- Explicit columns for queried fields; JSONB for rare ones (tax, HSN, GST,
  integrations).
- Every business table has `organization_id`; most have `station_id`. RLS is
  mandatory; no query may leak tenants.
- `stock_movements` is the inventory source of truth. No summary or
  materialized tables until performance proves it.
- Migrations: one source, `packages/db/migrations`, generated from
  `packages/db/src/schema.ts`.
  - Changed `schema.ts`? Run `npm run db:generate -w @pump/db` and commit all
    output.
  - RLS/triggers/functions/grants: `npm run db:generate:custom -w @pump/db -- <name>`.
  - `supabase/migrations` is written only by `npm run db:sync-supabase -w @pump/db`.
  - `npm run db:check -w @pump/db` proves it (CI runs it).
  - Load the `drizzle` skill before touching schema, migrations or
    `CREATE POLICY/TRIGGER/FUNCTION`.

# Access

Roles (source: `packages/shared/src/permissions/guards.ts`): Owner, Manager,
Accountant, Staff, Attendant (mobile-only, one DU per shift). Add no roles
unasked; per-user permission changes follow ADR 0013. A Role says whether the
**user** may act; whether the **Organization** may (Product Capabilities,
Limits, Restricted Access, Suspension) is server-enforced, and every mutating
tenant route declares its Restricted Access answer (coverage tests fail
otherwise). Load `pump-access-gating` for gated features, Limits or new
mutating routes.

# Frontend

- Stack: React, TypeScript, Vite, Tauri, Tailwind, shadcn/ui, TanStack
  Query/Table, React Hook Form + Zod, Zustand. Add no other state or form
  library unasked.
- UI: compact, information-dense, fast (Linear/Notion/Stripe, not SAP/Tally).
  Sidebar + top bar + content; one navigation system. List → Drawer → Edit;
  avoid modals. Reuse components before creating (`PageLayout`, `FormShell`,
  `Drawer`, `DataTable`, `StatusBadge`, `KpiCard`, pump-ds). Design:
  `DESIGN.md` + `pump-erp-design-system` skill.
- No business logic or direct DB access in components.
- Caching (TanStack Query, `TIER` in `packages/ui/src/query/hooks.ts`):
  static 24h persisted (stations, tanks, dispensers, nozzles, terminals,
  templates, users) · semi 10m persisted (products, customers, suppliers,
  expense categories) · operational 15s not persisted (shift status, sales,
  collections, inventory, DSR). Read via hooks/`ensureQueryData` with a
  `queryKeys` key; every mutation invalidates its keys (operational writes via
  `useInvalidateOperational`); bump `CACHE_BUSTER` on persisted shape changes;
  no `refetchOnMount: 'always'`. Load `pump-data-caching` for any fetch or
  mutation.

Backend: Hono, Drizzle, Supabase Postgres; shared types, schemas and
validation.

# Toolchain (Vite+)

`vp` = Vite + Vitest + **Oxlint** (lint) + **Oxfmt** (format) behind one CLI.
Config: root `vite.config.ts` (`lint`, `fmt`, `staged`), per-package
`vite.config.ts` / `vitest.config.ts`. No ESLint or Prettier outside the
standalone `apps/marketing`.

```text
npm test               all workspaces (`vp test run` each)
npm run test:scripts   guard-script tests (scripts/)
npm run lint           Oxfmt check + guard scripts + Oxlint (same as CI)
npx vp check --fix     format + lint, fixing
npx vp fmt .           format
npx tsc -b             type check; also builds packages/*/dist
npm run typecheck:tests
```

- Test APIs from `vite-plus/test`; config helpers from `vite-plus`.
- Pre-commit runs `vp staged` (`vp check --fix` on staged files).
- Guard scripts: `scripts/check-*.mjs`. `check-domain-patterns` ratchets
  recurring review findings against `scripts/domain-patterns-baseline.json`;
  after removing matches run it with `--update-baseline`.
- Workspaces: `apps/*` → `apps-<dir>` (`-w apps-api`); `packages/*` →
  `@pump/<dir>` (`-w @pump/ui`). `apps/marketing` is a standalone install.
- Fresh worktree: `npm ci` (no `node_modules` symlink), then `npx tsc -b`
  before any per-package check; packages import each other's `dist`.
- Wait for CI with one `gh pr checks <n> --watch --fail-fast`, not `sleep`
  loops.

# Git & PR flow

- Branch from latest `origin/dev`, descriptive name; PR to `dev`. `main` gets
  only `dev → main` releases (`RELEASING.md`). Schema changes go to `dev` in
  their own small PR, never held on a long-lived branch (ADR 0012).
- Done = the PR's checks are green, not local checks.

# Pointers

- Review standards: `CODING_STANDARDS.md`.
- Issues: GitHub `abdullahnettoor/pumpos` (`docs/agents/issue-tracker.md`);
  long-range plans in `docs/roadmap/phase-*.md`; status lives in issues.
- Doc map: `docs/README.md`. `docs/archive/` is history only.
- Domain docs: `docs/agents/domain.md`.

<!-- graft:start -->

## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
