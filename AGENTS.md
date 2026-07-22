# PumpOS

This document defines the architectural, business, and engineering rules that all AI agents and contributors must follow when working on this repository.

---

# Project Overview

PumpOS is a multi-tenant fuel station management platform designed primarily for Indian fuel stations.

**Tagline**: The operating system for fuel retail.

Primary goals:

* Operational simplicity
* Network resilience (graceful degradation, not offline-first)
* Strong auditability
* Multi-tenant isolation
* Fast desktop experience
* Future extensibility

This is NOT a POS system.

This is NOT a traditional accounting package.

This is an operational operating system focused on fuel station management.

---

# Core Architecture Principles

## Business-Day & Shift Anchoring

The platform has two anchors, and using the right one is the single most
important domain rule:

* **`business_day_id`** is the **universal anchor**. Every operational and
  financial record belongs to a business day.
* **`shift_id`** is present **if and only if the money touches the physical cash
  drawer.** A shift is an operator-accountability window for drawer cash.

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

Anchoring rules (DO NOT couple everything to a shift):

* Fuel/merchandise **sales** occur within a shift (operator accountability) →
  `shift_id` set.
* **Cash** collections / cash supplier payments / drawer (`SHIFT_CASH`) expenses
  touch the drawer → `shift_id` set.
* **Card / UPI / bank / online** collections, **bank/owner** expenses,
  **purchases**, and **credit sales** do NOT touch the drawer → `shift_id` is
  NULL, anchored to the business day only.
* **Credit sales are receivables**, not drawer cash. A fleet fuel-on-credit sale
  records only a customer-ledger debit (receivable); it never moves stock again
  (the fuel is already metered via nozzle readings). Customer balance =
  Σ credit sales − Σ collections.

Drawer reconciliation at shift close:

```text
expectedDrawerCash =
  openingCash + cashSales + cashCollections
  − drawerExpenses − drawerSupplierPayments − cashDrops
```

Never force card/UPI/bank/credit movements into the drawer reconciliation.

---

## Business-Day Date Resolution (timezone-aware)

A business day is keyed by **`(station, calendar date)`**, lazily opened when the
first shift OR financial entry of that date lands. Several business days may be
**open at once**; a past day is closed **independently** at any time (e.g. close
day 1 on day 5) — closing never blocks today's day. `OpenShift` and
`ensureBusinessDayForDate` both resolve via `findByStationAndDate`, so shifts and
financials always agree. Uniqueness is enforced by
`business_days_org_station_date_uniq (org, station, date)`.

The `business_date` (`varchar(10)` `YYYY-MM-DD`) is the single date anchor;
audit timestamps stay UTC. **Never derive a business date with
`new Date().toISOString().slice(0,10)`** — that is UTC-only and ignores the
day-start boundary. Always use **`resolveBusinessDate({ now, timeZone, dayStartsAt })`**
from `@pump/shared`, which converts the instant to the station's timezone and
rolls back to the previous date when the local time is before the station's
`business_day_starts_at` (a fuel day commonly runs 06:00 → 06:00).

* The station's `timezone` + `business_day_starts_at` are captured at onboarding
  and stored in `stations.settings`.
* The API resolves them via `loadStationClock(db, stationId)` and passes them into
  `buildContext` → `ExecutionContext.timeZone` / `.businessDayStartsAt`; core
  use-cases read those when calling `resolveBusinessDate`.
* The same helper is used client-side to default the shift-open date field.
* TODO: render displayed timestamps in station timezone (currently UTC-instant).

---

## Code Organization (ports & adapters)

* **`packages/core`** (`@pump/core`) — framework-agnostic domain. Capability
  folders (`station-setup`, `station-ops`, `inventory`, `retail`, `purchasing`,
  `crm`, `finance`, `reporting`) composed of **use-cases**. Repository **ports**
  (interfaces) live here. Core never imports Hono, Drizzle, React or SQL.
* **`apps/api`** — thin Hono routes that wire Drizzle repository **adapters** +
  the event dispatcher into core use-cases. Mutations run inside
  `runInTransaction(db, (tx, events) => useCase.execute(...))`, a transactional
  outbox: state changes AND the `events` append commit atomically.
* Response envelope is always `{ success: true, data }` or
  `{ success: false, error: { code, message } }`.
* Mutating routes honor an optional `Idempotency-Key` header (dedupes retries /
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

* PostgreSQL is always authoritative.
* The local store is a durable **write outbox + warm read cache**, never the
  final source of truth.
* The product target is **Level 2 resilience** (online-primary, graceful
  degradation on connectivity drops) — NOT cold-start offline-first and NOT
  multi-day disconnected operation. See `docs/roadmap/phase-O-offline-sync.md`.
* Sync eventually reconciles queued local events to cloud; replay is idempotent.

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

* Drive synchronization
* Drive auditing
* Drive reporting

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

## Manual Sales

Manual sales are used for:

```text
Engine Oil
Coolant
Grease
Accessories
```

Manual sales are separate from fuel sales.

---

## Shift Summary & DSSR

There are **two** immutable report snapshots:

* **Shift Summary** — created when a **shift is closed** (`shift_summaries`).
  Holds that shift's nozzle reconciliation, drawer reconciliation, and totals.
* **DSSR** (Daily Station Sales Report) — created when a **business day is
  closed** / generated on demand (`dssr_snapshots`). Composes all of the day's
  closed-shift summaries plus business-day-anchored financials (collections,
  expenses, purchases, supplier payments, credit sales).

Rules for both:

* Stored permanently.
* Never recalculated historically.
* Never modified after generation (regeneration is explicit + idempotent).

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

Current MVP Roles:

```text
Owner
Manager
Accountant
Staff
```

Do not introduce additional roles unless explicitly requested.

Enterprise features may introduce:

```text
Custom Roles
Custom Permissions
```

---

# UI Design Principles

Inspiration:

* Notion
* Linear
* Atlassian
* Stripe Dashboard

Avoid:

* Traditional ERP layouts
* SAP-style interfaces
* Tally-style interfaces

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

* Type-safe APIs
* Shared schemas
* Shared validation

---

# Database Rules

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

* Read through query hooks / `ensureQueryData` with a **centralized key** — never call
  `service.getX()` directly in a component (that bypasses the cache).
* **Every mutation invalidates its key(s).** Setup edits invalidate their static/semi key;
  operational writes use `useInvalidateOperational` (which also refreshes `customers` and
  `suppliers` whose balances move).
* Persist only static/semi (`PERSIST_PREFIXES`); bump `CACHE_BUSTER` on payload shape changes.
* Never use `refetchOnMount: 'always'` on tiered queries.

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

* Never block a core operator action (sale, expense, collection, shift
  open/**close**) on the network — queue it, don't gate it.
* Writes: optimistic apply → durable local outbox → retry/backoff → idempotent
  replay (via `idempotency_keys` + unique `event_id`).
* Reads: serve from the warm TanStack Query cache; show honest sync state
  (online / pending N / failed).
* Cloud stays authoritative; last-writer-wins on projections; flag only
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
