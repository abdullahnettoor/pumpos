# Architecture

PumpOS v2 is a cloud-authoritative, event-driven, multi-tenant fuel-station ERP
built as a TypeScript monorepo with a **ports & adapters** (hexagonal) core.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│ apps/web · apps/desktop   React shells (thin)                │
│   └─ @pump/ui             components + cloud.ts + query hooks │
├─────────────────────────────────────────────────────────────┤
│ apps/api                  Hono routes = thin ADAPTERS         │
│   └─ infra/repositories   Drizzle implementations of ports    │
│   └─ infra/transaction    runInTransaction (outbox)           │
├─────────────────────────────────────────────────────────────┤
│ @pump/core                FRAMEWORK-AGNOSTIC DOMAIN           │
│   └─ kernel               Result, Clock, events, ports        │
│   └─ capabilities         use-cases + repository PORTS         │
├─────────────────────────────────────────────────────────────┤
│ @pump/shared              Zod schemas, types, guards, Result  │
│ @pump/db                  Drizzle schema + migrations         │
├─────────────────────────────────────────────────────────────┤
│ Supabase PostgreSQL (authoritative)  ·  SQLite (future cache) │
└─────────────────────────────────────────────────────────────┘
```

**Rule:** `@pump/core` never imports Hono, Drizzle, React or SQL. It declares
repository *ports* (interfaces); `apps/api` injects Drizzle *adapters*.

## Business-day & shift anchoring (the core domain rule)

Two anchors exist, and choosing the right one is the most important domain decision:

- **`business_day_id`** — the **universal anchor**. Every operational and financial
  record belongs to a business day.
- **`shift_id`** — present **iff the money touches the physical cash drawer.** A shift
  is an operator-accountability window for drawer cash.

```
Business Day
 ↓
Shift(s)            ← drawer-cash accountability
 ↓
Operations
 ↓
Shift Summary       ← immutable snapshot, created on SHIFT close (shift_summaries)
 ↓
DSSR                ← immutable snapshot, created on BUSINESS-DAY close (dssr_snapshots)
 ↓
Reports
```

| Record | shift_id | Reason |
|---|---|---|
| Fuel/merchandise sale | **set** | operator accountability within a shift |
| Cash collection, cash supplier payment, drawer (`SHIFT_CASH`) expense | **set** | touches the drawer |
| Card / UPI / bank / online collection | NULL | no drawer impact |
| Bank/owner expense, purchase, supplier bank payment | NULL | business-day anchored |
| Credit sale (receivable) | NULL | not drawer cash; a customer-ledger debit |

**Credit sales are receivables, not cash.** A fleet fuel-on-credit sale records only a
customer-ledger debit; it never moves stock again (the fuel is already metered via
nozzle readings). Customer balance = Σ credit sales − Σ collections.

### Drawer reconciliation (at shift close)

```
expectedDrawerCash =
  openingCash + cashSales + cashCollections
  − drawerExpenses − drawerSupplierPayments − cashDrops
```

Never force card/UPI/bank/credit movements into drawer reconciliation.

## Request lifecycle (a mutation)

```
React screen → cloud.ts service (fetch + envelope) → Hono route (auth, guard,
  Idempotency-Key) → runInTransaction(db, (tx, events) => useCase.execute(cmd, ctx))
    → use-case: validate → repo.save(...) via tx adapters → events.publish([...])
  → COMMIT (state + events atomically) → { success, data } envelope → cache invalidate
```

- **Response envelope** is always `{ success: true, data }` or
  `{ success: false, error: { code, message } }`.
- **Transactional outbox:** the state change AND the append to the `events` table
  commit in one DB transaction (`runInTransaction`). A failure rolls back both.
- **Idempotency:** mutating routes honor an optional `Idempotency-Key` header,
  deduping retries/offline replays via the `idempotency_keys` store.

## Event-driven model

Every meaningful business action emits a domain event (canonical envelope in the
`events` table). Events drive auditing, future sync, and reporting projections. The
catalog of event types lives in `@pump/core` (`kernel/event-catalog.ts`,
`BusinessEvents`). Examples: `SHIFT_OPENED`, `SHIFT_CLOSED`, `FUEL_SALE_RECORDED`,
`RETAIL_SALE_CREATED`, `CREDIT_SALE_CREATED`, `PURCHASE_CREATED`, `GOODS_RECEIVED`,
`EXPENSE_RECORDED`, `DSSR_GENERATED`.

## Two report snapshots

- **Shift Summary** (`shift_summaries`) — created when a shift is **closed**. Holds that
  shift's nozzle reconciliation, drawer reconciliation, totals.
- **DSSR** (`dssr_snapshots`) — created when a business day is **closed** / generated on
  demand. Composes the day's closed-shift summaries + business-day-anchored financials.

Both are immutable: stored permanently, never recalculated historically. Regeneration
is explicit and idempotent (`GenerateDssr` returns the existing snapshot unless forced).

## Multi-tenancy & authorization

- Every business table has `organization_id`; most operational tables also have
  `station_id`. RLS is enabled in the DB; the Worker connects with a privileged role
  and **also enforces org isolation in application code** (every use-case checks
  `ctx.organizationId`).
- Roles: **Owner, Manager, Accountant, Staff** (see
  [`docs/initial/Permissions & Authorization Matrix (v1).md`](../initial/Permissions%20&%20Authorization%20Matrix%20(v1).md)).
  Guards live in `@pump/shared/permissions/guards.ts` and are applied in routes.

## Offline (deferred)

PostgreSQL is authoritative; SQLite is a future operational cache. The event backbone
+ idempotency keys make offline a later phase with no domain change. See
[open-questions.md](open-questions.md).
