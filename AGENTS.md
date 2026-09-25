# PumpOS

This document defines the architectural, business, and engineering rules that all AI agents and contributors must follow when working on this repository.

---

# Project Overview

PumpOS is a multi-tenant fuel station management platform designed primarily for Indian fuel stations.

**Tagline**: The operating system for fuel retail.

Primary goals:

- Operational simplicity
- Network resilience (graceful degradation, not offline-first)
- Strong auditability
- Multi-tenant isolation
- Fast desktop experience
- Future extensibility

This is NOT a POS system.

This is NOT a traditional accounting package.

This is an operational operating system focused on fuel station management.

---

# Core Architecture Principles

## Business-Day & Shift Anchoring

A station has two worlds, and using the right anchor is the single most
important domain rule (ADR 0005):

- **Forecourt → `business_day_id` + `shift_id`.** The business day is the
  station's **sales day**: it starts at the Day Start chosen at onboarding and
  runs 24h. It holds shifts and **all sales** (fuel, product, credit, including
  their card/UPI method) and cash drops.
- **Office → entry date only.** Collections (any method, even at a pump
  terminal), supplier payments, expenses, income and bank work are handled by
  the office, not attendants. They carry a **station-timezone calendar date**
  and no shift or business day, and live in the ledger. The test is "is this
  paying for fuel or products right now?", not "which machine was used?"

Office Records (entry date + Funding Account), the sales-only DSSR, the
Daily Cash Book and the per-Attendant Drawer are implemented.

Operational flow:

```text
Business Day
 ↓
Shift(s)            ← drawer-cash accountability
 ↓
Operations
 ↓
Shift Summary       ← immutable snapshot, created on SHIFT close
 ↓
DSSR                ← immutable snapshot, created on BUSINESS-DAY close
 ↓
Reports
```

Anchoring rules (target, ADR 0005):

- **All sales** (fuel, product, credit) occur within a shift → `shift_id` +
  `business_day_id`. The card/UPI method of a sale is part of the sale.
- **Office records** (collections, supplier payments, expenses, income, bank
  work) → **entry date only** (station-timezone calendar date, never Day
  Start), no `shift_id`, no `business_day_id`.
- **Purchases** are forecourt stock events → `business_day_id` (sealed with
  the day), never a `shift_id`. Paying for one is a separate supplier payment
  (an office record).
- **Credit sales are receivables**, not drawer cash. A fleet fuel-on-credit sale
  records only a customer-ledger debit (receivable); it never moves stock again
  (the fuel is already metered via nozzle readings). Customer balance =
  Σ credit sales − Σ collections.

Drawer reconciliation (ADR 0005). Each Attendant/DU has its own Drawer with
an Opening Float issued at shift open (`shift_staff_assignments.opening_float`)
and is reconciled at Handover. Variance is two-level (#287): the office's
expected figure is built from each Drawer's **declared** cash
(`expectedShiftDrawerCash` / `computeShiftCloseCash`), and the attendant
variance is tracked separately:

```text
drawer.expectedCash = openingFloat + DU cash sales − cashDrops        (at Handover)
attendantVariance   = Σ (declared + drops − drawer.expectedCash)       (Handover)
expectedDrawerCash  = Σ declared − unassigned drops at close           (office)
officeCountVariance = counted − expectedDrawerCash                     (shift close)
```

Every Drawer must hand over before the shift closes. The Shift's opening cash
is not stored; it is Σ Opening Floats. The ledger receives only cash actually
received (Σ declared cash sales, floats excluded); attendant shortages are not
posted (a later feature may post them as recoverable).

Office cash taken from a drawer is a cash drop. A drop recorded at close names
its Drawer (reducing that Drawer's expected cash); one naming no Drawer goes to
the office variance. Cash moved after close is not a drop: it is an office
transfer (Cash in Hand → Safe/Bank) dated by the Entry Date. Cash in Hand (`CASH_IN_HAND`)
is the office cash account. Never force card/UPI/bank/credit movements into
the drawer reconciliation.

---

## Business-Day Date Resolution (timezone-aware)

A business day is keyed by **`(station, calendar date)`**, lazily opened when the
first shift or sale of that date lands. Several business days may be
**open at once**; a past day is closed **independently** at any time (e.g. close
day 1 on day 5) — closing never blocks today's day. Uniqueness is enforced by
`business_days_org_station_date_uniq (org, station, date)`.

Office records use an **entry date** (station-timezone calendar date, no Day
Start rollback) instead of a business day (ADR 0005).

The `business_date` (`varchar(10)` `YYYY-MM-DD`) is the single date anchor;
audit timestamps stay UTC. **Never derive a business date with
`new Date().toISOString().slice(0,10)`** — that is UTC-only and ignores the
day-start boundary. Always use **`resolveBusinessDate({ now, timeZone, dayStartsAt })`**
from `@pump/shared`, which converts the instant to the station's timezone and
rolls back to the previous date when the local time is before the station's
`business_day_starts_at` (the Day Start chosen at onboarding).

- The station's `timezone` + `business_day_starts_at` are captured at onboarding
  and stored in `stations.settings`.
- The API resolves them via `loadStationClock(db, stationId)` and passes them into
  `buildContext` → `ExecutionContext.timeZone` / `.businessDayStartsAt`; core
  use-cases read those when calling `resolveBusinessDate`.
- The same helper is used client-side to default the shift-open date field.
- TODO: render displayed timestamps in station timezone (currently UTC-instant).

---

## Code Organization (ports & adapters)

- **`packages/core`** (`@pump/core`) — framework-agnostic domain. Capability
  folders (`station-setup`, `station-ops`, `inventory`, `retail`, `purchasing`,
  `crm`, `finance`, `reporting`) composed of **use-cases**. Repository **ports**
  (interfaces) live here. Core never imports Hono, Drizzle, React or SQL.
- **`apps/api`** — thin Hono routes that wire Drizzle repository **adapters** +
  the event dispatcher into core use-cases. Mutations run inside
  `runInTransaction(db, (tx, events) => useCase.execute(...))`, a transactional
  outbox: state changes AND the `events` append commit atomically.
- Response envelope is always `{ success: true, data }` or
  `{ success: false, error: { code, message } }`.
- Mutating routes honor an optional `Idempotency-Key` header (dedupes retries /
  offline replays via the `idempotency_keys` store).

---

## Cloud Authoritative Architecture

Source of truth:

```text
Supabase PostgreSQL
```

Local durability (resilience only, not a full offline store):

```text
Write outbox — Tauri SQLite (desktop) / IndexedDB (web)
```

Rules:

- PostgreSQL is always authoritative.
- The local store is a durable **write outbox + warm read cache**, never the
  final source of truth.
- The product target is **Level 2 resilience** (online-primary, graceful
  degradation on connectivity drops) — NOT cold-start offline-first and NOT
  multi-day disconnected operation. See `docs/roadmap/phase-O-offline-sync.md`.
- Sync eventually reconciles queued local events to cloud; replay is idempotent.

---

## Event Driven Architecture

Every meaningful business action should generate a business event.

Examples:

```text
SHIFT_OPENED
SHIFT_CLOSED
EXPENSE_RECORDED
PURCHASE_RECORDED
SALE_RECORDED
DSSR_GENERATED
```

Business events:

- Drive synchronization
- Drive auditing
- Drive reporting

Do not bypass event creation.

---

# Domain Rules

## Fuel Sales

Fuel sales are derived from:

```text
Nozzle Readings
```

NOT from manual sales entries.

Formula:

```text
Volume Sold =
Closing Reading
-
Opening Reading
```

Opening readings should default from previous closing readings.

---

## Product Sales

Product sales (formerly "manual sales") are used for:

```text
Engine Oil
Coolant
Grease
Accessories
```

Product sales are separate from fuel sales, which derive from nozzle readings.
See `CONTEXT.md` ("Sale", "Fuel Sale", "Product Sale") for the shared language.

---

## Shift Summary & DSSR

There are **two** immutable report snapshots:

- **Shift Summary** — created when a **shift is closed** (`shift_summaries`).
  Holds that shift's nozzle reconciliation, drawer reconciliation, and totals.
- **DSSR** (Daily Station Sales Report) — created when a **business day is
  closed** / generated on demand (`dssr_snapshots`). Sales-only: composes the
  day's closed-shift summaries plus the day's sales, credit sales, purchases
  and stock. Office Records (collections, expenses, income, supplier
  payments) are not in it — they live in the live **Daily Cash Book**.

Rules for both:

- Stored permanently.
- Never recalculated historically.
- Never modified after generation (regeneration is explicit + idempotent).

---

## Variance

Variance is a first-class business concept.

Track:

```text
Expected Stock
Actual Stock
Variance
Reason
```

Never hide variance calculations inside reports.

---

# Data Modeling Rules

## IDs

Use UUIDs everywhere.

Never use document numbers as identifiers.

Example:

```text
id = UUID

document_number = SAL-000123
```

---

## Soft Deletes

Prefer:

```text
is_active
archived_at
```

Avoid physical deletion.

Historical data is important.

---

## Metadata Strategy

Frequently queried fields:

Use explicit columns.

Examples:

```text
product_type
customer_type
amount
quantity
```

Rarely queried fields:

Use JSONB.

Examples:

```text
Tax Configuration
HSN Codes
GST Metadata
Integration Settings
```

Do not create columns for every future tax requirement.

---

# Multi-Tenancy Rules

Every business table must include:

```text
organization_id
```

Most operational tables should also include:

```text
station_id
```

Never write queries that can leak tenant data.

Assume Row-Level Security (RLS) is mandatory.

---

# Authorization Rules

Current Roles (code is source of truth — see `guards.ts`):

```text
Owner
Manager
Accountant
Staff
Attendant   ← mobile-only; accountable for one Dispenser Unit (DU) per shift
```

Do not introduce additional roles unless explicitly requested.

Enterprise features may introduce:

```text
Custom Roles
Custom Permissions
```

A Role answers whether the **user** may act. Whether the **Organization** may —
its Product Capabilities, its Limits, and whether Restricted Access or
Suspension permits the write at all — is a separate axis enforced on the server.
Every mutating tenant route declares its Restricted Access answer, and a route
added without one fails the coverage tests. Apply the `pump-access-gating`
skill for any gated feature, Limit, or new mutating route.

---

# UI Design Principles

Inspiration:

- Notion
- Linear
- Atlassian
- Stripe Dashboard

Avoid:

- Traditional ERP layouts
- SAP-style interfaces
- Tally-style interfaces

---

## UI Philosophy

Prefer:

```text
Clean
Compact
Information Dense
Fast
```

Avoid:

```text
Cluttered
Modal-heavy
Deeply Nested
```

---

## Layout

Use:

```text
Sidebar
Top Bar
Content Area
```

Do not introduce multiple navigation systems.

---

## Forms

Use:

```text
React Hook Form
Zod
```

Do not introduce alternative form libraries without discussion.

---

## Editing Pattern

Preferred:

```text
List
 ↓
Drawer
 ↓
Edit
```

Avoid modal-heavy workflows.

---

# Frontend Stack

Use:

```text
React
TypeScript
Vite
Tauri
Tailwind
shadcn/ui
TanStack Query
TanStack Table
React Hook Form
Zod
Zustand
```

Do not introduce additional state libraries unless justified.

---

# Backend Stack

Use:

```text
Hono
Drizzle
Supabase PostgreSQL
```

Prefer:

- Type-safe APIs
- Shared schemas
- Shared validation

---

# Database Rules

Migrations have one source: `packages/db/migrations`, generated from
`packages/db/src/schema.ts`. `supabase/migrations` is derived from it.

- Changing `schema.ts`? Run `npm run db:generate -w @pump/db` in the same
  change and commit everything it writes.
- Changing a generated migration means changing `schema.ts` and regenerating.
- RLS, triggers, functions and grants go in a custom migration:
  `npm run db:generate:custom -w @pump/db -- <name>`.
- `supabase/migrations` is written only by `npm run db:sync-supabase -w @pump/db`.
- `npm run db:check -w @pump/db` proves all of the above; CI runs it.

Apply the `drizzle-orm` skill before editing `schema.ts`, adding a migration,
touching `supabase/migrations`, or writing `CREATE POLICY/TRIGGER/FUNCTION` SQL.

Never optimize prematurely.

Avoid:

```text
Summary Tables
Materialized Tables
Denormalization
```

unless performance proves necessary.

Current source of truth:

```text
stock_movements
```

for inventory.

---

# Data Caching & Performance

Client data is cached with TanStack Query, **tiered by how often it changes**, to keep the
app fast without ever showing same-session stale data. Apply the `pump-data-caching` skill for
any data fetch or mutation.

Tiers (see `packages/ui/src/query/hooks.ts` → `TIER`):

```text
static       (stations, tanks, dispensers, nozzles, terminals, templates, users)  → 24h, persisted
semi         (products, customers, suppliers, expense categories)                 → 10m, persisted
operational  (shift status, sales, collections, inventory, DSSR)                  → 15s, not persisted
```

Mandatory rules:

- Read through query hooks / `ensureQueryData` with a **centralized key** — never call
  `service.getX()` directly in a component (that bypasses the cache).
- **Every mutation invalidates its key(s).** Setup edits invalidate their static/semi key;
  operational writes use `useInvalidateOperational` (which also refreshes `customers` and
  `suppliers` whose balances move).
- Persist only static/semi (`PERSIST_PREFIXES`); bump `CACHE_BUSTER` on payload shape changes.
- Never use `refetchOnMount: 'always'` on tiered queries.

Full plan + audit: `docs/roadmap/phase-P-performance.md`. Practice + review checklist:
`.agents/skills/pump-data-caching/SKILL.md`.

---

# Resilience Rules (Level 2 — online-primary, graceful degradation)

PumpOS is used **mostly online**. Connectivity problems must never block the
operator: the app degrades gracefully and reconciles when the network returns.
This is **not** offline-first (cold start with no internet) and **not** multi-day
disconnected operation — those are an explicitly-future **Level 3** (see
`docs/roadmap/phase-O-offline-sync.md`).

Desktop (Tauri) is the resilience tier: its UI, code, and assets (incl. fonts)
are bundled locally via `frontendDist`, so the shell always loads — only data/API
calls need the network. Mobile is online-only.

Rules when connectivity drops mid-session:

- Never block a core operator action (sale, expense, collection, shift
  open/**close**) on the network — queue it, don't gate it.
- Writes: optimistic apply → durable local outbox → retry/backoff → idempotent
  replay (via `idempotency_keys` + unique `event_id`).
- Reads: serve from the warm TanStack Query cache; show honest sync state
  (online / pending N / failed).
- Cloud stays authoritative; last-writer-wins on projections; flag only
  money-sensitive collisions (drawer / shift-close) for review.

Every sync operation must be idempotent.

---

# Sync Rules

Every business event must contain:

```text
event_id
event_type

organization_id
station_id

entity_type
entity_id
```

Duplicate events must be safe to replay.

---

# Code Quality Standards

## Prefer

Small functions.

Single responsibility.

Strong typing.

Reusable components.

Composition over inheritance.

---

## Avoid

Massive files.

Business logic inside React components.

Duplicated validation.

Direct database access from UI.

---

# Component Reuse Rules

Before creating a new component:

Check whether an existing component can be reused.

Examples:

```text
PageLayout
FormShell
Drawer
DataTable
StatusBadge
KpiCard
```

Prefer extending existing patterns.

---

# Reporting Rules

Reports should be generated from:

```text
Snapshots
Events
Operational Records
```

Never build reports using hardcoded calculations inside UI components.

---

# Future Expansion Principles

Future modules should extend the architecture.

Examples:

```text
Attendance
WhatsApp
GST Exports
Advanced Accounting
POS Integrations
Hardware Integrations
```

Do not redesign core entities when adding new modules.

Extend existing domain concepts.

---

# Contributor Rule

When implementing a feature:

1. Check Domain Model.
2. Check Event Model.
3. Check Database Schema.
4. Check Permissions Matrix.
5. Check Design System.

If a proposed implementation violates any of those documents, stop and revisit the architecture before coding.

Architecture decisions take precedence over implementation convenience.

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `abdullahnettoor/pumpos`; long-range planning remains in `docs/roadmap/phase-*.md`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### User flow

For any "how does an operator do X in the app" question — which screen, which button, the end-to-end order of onboarding → shifts → day close — see `docs/USER-FLOW.md` (navigation map: `docs/screenshots/FLOWS.md`).

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
