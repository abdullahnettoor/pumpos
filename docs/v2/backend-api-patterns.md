# Backend — API Patterns (`apps/api`)

`apps/api` is a Hono app on Cloudflare Workers, reaching Supabase PostgreSQL through
Hyperdrive. **Routes are thin adapters**: they authenticate, authorize, build an
`ExecutionContext`, wire Drizzle repository adapters + the event dispatcher into a core
use-case inside a transaction, and map the `Result` to the HTTP envelope.

```
apps/api/src/
  index.ts                  app bootstrap: CORS, db middleware, JWT auth, idempotency, route mounts
  routes/                   station-setup, payment-terminals, products, shifts, transactions, dssr
  infra/
    context.ts              buildContext(user, opts) -> ExecutionContext
    events.ts               DrizzleEventStore + createDispatcher(db)
    transaction.ts          runInTransaction(db, fn) — transactional outbox
    idempotency.ts          Idempotency-Key middleware
    doc-numbers.ts          TimestampDocumentNumberGenerator
    onboarding-provisioner.ts  DrizzleOnboardingProvisioner
    repositories/           Drizzle implementations of core ports
```

## The thin-adapter pattern

```ts
transactionsRouter.post('/sales', async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => ({}));
  const result = await runInTransaction(c.var.db, (tx, events) =>
    new CreateSale({
      sales: new DrizzleSaleRepository(tx),
      stock: new DrizzleStockMovementRepository(tx),
      ledger: new DrizzleCustomerLedgerRepository(tx),
      customers: new DrizzleCustomerRepository(tx),
      shifts: new DrizzleShiftRepository(tx),
      docNumbers,                       // module-level singleton
      events,                           // tx-scoped dispatcher
    }).execute(body, buildContext(user)),
  );
  return sendResult(c, result);
});
```

Key points:
- Build every repository with the **transaction handle `tx`** so writes participate
  in the transaction.
- `events` is a **tx-scoped** dispatcher (writes to the `events` table inside the same
  transaction → transactional outbox).
- `buildContext(user, { stationId, businessDayId })` produces the `ExecutionContext`
  with `SystemClock` + `UuidGenerator`.

## `runInTransaction` (transactional outbox)

```ts
export async function runInTransaction<T>(
  db: DbClient,
  fn: (tx: DbClient, events: EventPublisher) => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    return await db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as DbClient;
      const events = createDispatcher(tx);          // DrizzleEventStore on tx
      const result = await fn(tx, events);
      if (!result.success) throw new RollbackSignal(result.error);  // roll back on err
      return result;
    });
  } catch (e) {
    if (e instanceof RollbackSignal) return { success: false, error: e.error };
    throw e;
  }
}
```

A use-case returning `err(...)` rolls the whole transaction back (state + events) and
surfaces the same `Result`.

## Response envelope + `sendResult`

Every response is `{ success: true, data }` or `{ success: false, error: { code, message } }`.
`sendResult` maps core `ErrorCodes` to HTTP status:

```ts
const STATUS_BY_CODE = { VALIDATION_ERROR: 400, NOT_FOUND: 404, CONFLICT: 409,
  FORBIDDEN: 403, UNAUTHORIZED: 401, INVARIANT_VIOLATION: 409 };
```

## Authorization

`c.var.user` = `{ id, email, organizationId, role, assignedStationIds }` (resolved by the
JWT auth middleware). Guards from `@pump/shared/permissions/guards.ts` gate mutations;
they encode the Permissions Matrix. Current mapping:

| Action | Guard | Roles |
|---|---|---|
| Open/close shift | `canOpenShift` / `canCloseShift` | Owner, Manager, Staff |
| Reopen shift | `canReopenShift` | Owner, Manager |
| Products / tanks / DU / nozzles / templates | `canManageProduct` / `canManageInfrastructure` | Owner, Manager |
| Users | `canManageUsers` | Owner |
| Create/edit customer · supplier · vehicle | `canManageCustomers` / `canManageSuppliers` | Owner, Manager, Accountant |
| Archive customer/supplier/vehicle | `canArchiveParty` | Owner, Manager |
| Record purchase / supplier payment | `canRecordPurchase` | Owner, Manager, Accountant |
| Record expense / collection / sale | (none) | all roles (Staff records them) |
| Generate DSSR | `canExportReports` | Owner, Manager, Accountant |
| Station-scoped reads/writes | `isAuthorizedForStation(user, { organizationId, stationId })` | — |

Use-cases also re-check `ctx.organizationId` ownership; RLS is a third layer.

## Idempotency

`infra/idempotency.ts` is mounted after auth (`api.use('*', idempotency)`). When a
mutating request carries an `Idempotency-Key` header:
- Reserve the key (`insert ... onConflictDoNothing`).
- On a duplicate, return the **cached response** (or `409` if still in flight).
- Cache 2xx/4xx responses; release the reservation on 5xx so transient failures retry.
- GET/HEAD and keyless requests pass through untouched.

Backed by the `idempotency_keys` table (`organization_id`, unique `idempotency_key`,
`request_path`, `response_status`, `response_body`).

## Read projections

`GET` endpoints are direct, read-only `db.select(...)` projections in the route (no
use-case). They **must** anchor org/station scoping via `business_days`
(`...innerJoin(businessDays).where(eq(businessDays.organizationId, orgId))`) — never via
`shifts`, because `shift_id` is nullable on financial tables in v2. Enrichment (joining
names, computing balances/summaries) happens here.

## Drizzle adapters

Each core port has a `Drizzle*Repository` in `infra/repositories/`. `save` is typically
an upsert (`insert ... onConflictDoUpdate`). Map entity string fields to columns; convert
ISO strings ↔ `Date` at the boundary.

## Adding a route

1. Implement the Drizzle adapter(s) for the use-case's ports.
2. Add a handler that: checks the guard → `runInTransaction` → instantiate the use-case
   with `tx` adapters + `events` → `sendResult`.
3. Mount the router in `index.ts` (it sits behind auth + idempotency automatically).
4. Add a method to `cloud.ts` in `@pump/ui` (see [frontend-patterns.md](frontend-patterns.md)).
