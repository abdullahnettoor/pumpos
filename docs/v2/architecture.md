# Architecture

PumpOS v2 is a cloud-authoritative, event-driven, multi-tenant fuel-station ERP
built as a TypeScript monorepo with a **ports & adapters** (hexagonal) core.

## Layers

```
┌────────────────────────────────────────────────────────────────────┐
│ apps/console · apps/desktop     React shells                         │
│   └─ @pump/ui                   shared UI + services + query hooks    │
├────────────────────────────────────────────────────────────────────┤
│ apps/api                        Hono adapters + Drizzle repositories   │
├────────────────────────────────────────────────────────────────────┤
│ @pump/core                      framework-agnostic use-cases + ports   │
├────────────────────────────────────────────────────────────────────┤
│ @pump/shared                    schemas, types, guards, utilities      │
│ @pump/db                        Drizzle schema + migrations            │
├────────────────────────────────────────────────────────────────────┤
│ Supabase PostgreSQL — authoritative source of truth                   │
└────────────────────────────────────────────────────────────────────┘
```

**Rule:** `@pump/core` never imports Hono, Drizzle, React or SQL. It declares
repository _ports_ (interfaces); `apps/api` injects Drizzle _adapters_.

## Business-day, Shift, and Entry Date anchoring

Use the correct anchor for the record's business meaning:

- **`business_day_id`** — the sales-day anchor for forecourt operations, Shift
  Summaries, DSSR, and purchases/stock events.
- **`shift_id`** — a Shift anchor for every Sale and Cash Drop. A Shift is the
  attendant-accountability window for Drawer cash; credit Sales are receivables,
  but remain Sales and therefore carry the Business Day and Shift.
- **Entry Date** — a station-timezone calendar date for Office Records. Collections,
  Supplier Payments, Expenses, Income, and bank work carry no `business_day_id`
  or `shift_id` (ADR 0005).

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

| Record                                                   | Anchor                 | Reason                                            |
| -------------------------------------------------------- | ---------------------- | ------------------------------------------------- |
| Fuel, product, and credit Sale                           | Business Day + Shift   | All Sales occur within a Shift                    |
| Cash Drop                                                | Business Day + Shift   | Forecourt cash movement tied to a Drawer if known |
| Collection, supplier payment, expense, income, bank work | Entry Date only        | Office Record; no Shift or Business Day           |
| Purchase / stock receipt                                 | Business Day, no Shift | Forecourt stock event sealed with the day         |

Office Records never enter Drawer reconciliation, regardless of payment method
or where a terminal is used.

**Credit sales are receivables, not cash.** A fleet fuel-on-credit sale records only a
customer-ledger debit; it never moves stock again (the fuel is already metered via
nozzle readings). Customer balance = Σ credit sales − Σ collections.

### Drawer reconciliation (at shift close)

```
drawer.expectedCash = openingFloat + DU cash sales − that Drawer’s cash drops
attendantVariance = Σ (declared drawer cash + drops − drawer.expectedCash)
expectedDrawerCash = Σ declared drawer cash − unassigned cash drops
officeCountVariance = counted cash − expectedDrawerCash
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
- **DSSR** (`dssr_snapshots`) — created when a Business Day is **closed** / generated on
  demand. Sales-only: composes the day's closed-Shift summaries, Sales, purchases, and
  stock. Office Records are excluded and shown in the live Daily Cash Book.

Both are immutable: stored permanently, never recalculated historically. Regeneration
is explicit and idempotent (`GenerateDssr` returns the existing snapshot unless forced).

## Multi-tenancy & authorization

- Every business table has `organization_id`; most operational tables also have
  `station_id`. RLS is enabled in the DB; the Worker connects with a privileged role
  and **also enforces org isolation in application code** (every use-case checks
  `ctx.organizationId`).
- Roles: **Owner, Manager, Accountant, Staff, Attendant**. Current role
  definitions are in `@pump/shared/permissions/guards.ts` and `GLOSSARY.md`;
  organization capabilities, limits, and subscription write policy are a
  separate access axis (ADR 0004).

## Resilience (Level 2 — graceful degradation)

PostgreSQL is authoritative. The product target is **Level 2**: online-primary,
tolerate transient connectivity drops (optimistic writes → durable client outbox
→ retry; warm-cache reads; reconcile on reconnect) — **not** cold-start offline-first
and **not** multi-day disconnected operation (Level 3, future). The durable client
write outbox and replay are not yet implemented. See
[`AGENTS.md`](../../AGENTS.md) for current resilience guarantees and
[../roadmap/phase-O-offline-sync.md](../roadmap/phase-O-offline-sync.md) for
remaining sync work.
