# Backend — Core Domain Patterns (`@pump/core`)

`@pump/core` is the framework-agnostic domain layer. It contains **use-cases** and
**repository ports** organized by capability. It depends only on `@pump/shared` (+ zod)
and **never** imports Hono, Drizzle, React or SQL.

NodeNext ESM: import specifiers use `.js` extensions. Build with `tsc -b`; test with
vitest (`npm run test --workspace=packages/core`).

## Folder layout

```
packages/core/src/
  kernel/                     building blocks (see below)
  capabilities/
    station-setup/            stations, products, tanks, dispensers, nozzles,
                              shift-templates, users, pricing, payment-terminals, onboarding
    station-ops/              business-days, shifts (open/readings/close/reopen/lock)
    inventory/                stock movements, adjustments, counts, variance
    retail/                   CreateSale (POS merchandise + credit)
    purchasing/               RecordPurchase, RecordSupplierPayment
    crm/                      customers, vehicles, collections, credit-sales, suppliers
    finance/                  expenses
    reporting/                dssr (GenerateDssr)
  index.ts                    barrel
```

## The kernel (`kernel/`)

| File | Provides |
|---|---|
| `result.ts` | `ok`/`err`/`fail`, `Result<T>` (re-exported from `@pump/shared`) |
| `errors.ts` | `ErrorCodes` + factories: `validationError`, `notFoundError`, `conflictError`, `forbiddenError`, `invariantViolation` |
| `clock.ts` | `Clock` / `IdGenerator` ports; `SystemClock`/`UuidGenerator` (prod), `FixedClock`/`SequentialIdGenerator` (tests) |
| `event.ts` | `DomainEvent` envelope + `createEvent` |
| `event-catalog.ts` | `BusinessEvents` const + `BusinessEventType` |
| `event-dispatcher.ts` | `EventPublisher`/`EventStore` ports, `InProcessEventDispatcher`, `InMemoryEventStore` |
| `use-case.ts` | `ExecutionContext`, `UseCase<I,O>`, `eventFromContext` |
| `repository.ts` | `Repository<T,ID>`, `UnitOfWork`, `DocumentNumberGenerator` |

`ExecutionContext` carries `organizationId`, `stationId`, `businessDayId`, `actorId`,
`correlationId`, `clock`, `ids`.

## Anatomy of a use-case

Two conventions, same architecture:

- **Rich slice** (own folder): `command.ts` / `validator.ts` / `events.ts` / `ports.ts`
  / `handler.ts` / `*.test.ts` — for behavior-heavy slices.
- **Consolidated slice** (single `index.ts`): for straightforward CRUD.

A use-case:
1. Validates input with a Zod schema → `err(validationError(...))` on failure.
2. Loads aggregates through **repository ports** and checks invariants
   (org ownership, status, anchoring).
3. Persists via ports.
4. Emits domain events via the injected `EventPublisher`.
5. Returns `Result<T>`.

```ts
export class RecordCreditSale implements UseCase<RecordCreditSaleCommand, CustomerLedgerEntry> {
  constructor(private readonly deps: RecordCreditSaleDeps) {}

  async execute(input: RecordCreditSaleCommand, ctx: ExecutionContext): Promise<Result<CustomerLedgerEntry>> {
    const p = schema.safeParse(input);
    if (!p.success) return err(validationError('Invalid RecordCreditSale command', { issues: p.error.flatten() }));

    const customer = await this.deps.customers.findById(cmd.customerId);
    if (!customer || customer.organizationId !== ctx.organizationId) return err(notFoundError('Customer', cmd.customerId));

    // resolve businessDayId (from shift, else open business day) — shift_id stays NULL (receivable)
    const entry: CustomerLedgerEntry = { /* ... */ };
    await this.deps.ledger.save(entry);
    await this.deps.events.publish([
      eventFromContext(ctx, { eventType: BusinessEvents.CREDIT_SALE_CREATED, aggregateType: 'Customer', aggregateId: customer.id, /* ... */ }),
    ]);
    return ok(entry);
  }
}
```

### Anchoring inside a use-case

The recurring pattern: resolve `businessDayId` from a shift or the open business day,
and set `shiftId` only when the money is drawer cash.

```ts
let businessDayId: string;
let shiftId: string | null;
if (cmd.shiftId) {
  const shift = await this.deps.shifts.findById(cmd.shiftId);     // station-ops port
  if (!shift || shift.organizationId !== ctx.organizationId) return err(notFoundError('Shift', cmd.shiftId));
  businessDayId = shift.businessDayId;
  shiftId = affectsDrawer ? shift.id : null;
} else if (cmd.stationId) {
  const bd = await this.deps.businessDays.findOpenByStation(ctx.organizationId, cmd.stationId);
  if (!bd) return err(invariantViolation('No open business day for this station'));
  businessDayId = bd.id;
  shiftId = null;
}
```

## Ports (interfaces)

Repository interfaces live in core; Drizzle implementations live in `apps/api`.
Ports only read/persist — no business rules.

```ts
export interface CustomerRepository extends Repository<Customer> {
  existsByName(organizationId: string, name: string, excludeId?: string): Promise<boolean>;
  listByOrganization(organizationId: string, activeOnly: boolean): Promise<Customer[]>;
}
```

Cross-capability dependencies are allowed via **ports only** (e.g. `RecordPurchase`
depends on inventory's `StockMovementRepository`, crm's `SupplierRepository`,
station-ops' `ShiftRepository`/`BusinessDayRepository`, and the kernel's
`DocumentNumberGenerator`).

## Orchestration use-cases

Multi-aggregate flows use a single port that the adapter implements transactionally.
Example: `FinalizeStationOnboarding` owns draft validation + event emission and
delegates the multi-table insert to an `OnboardingProvisioner` port (the adapter does
the inserts in one DB transaction and maps draft-local ids to real ids).

## Testing

Pure and deterministic — no DB. Use `FixedClock` + `SequentialIdGenerator` and
in-memory fakes implementing the ports. Assert on the returned `Result` and on the
events captured by `InMemoryEventStore`.

```ts
function ctx(): ExecutionContext {
  return { organizationId: 'org-1', stationId: 'st-1', businessDayId: null, actorId: 'u',
    correlationId: null, clock: new FixedClock(new Date('2026-03-15T10:00:00Z')), ids: new SequentialIdGenerator('c') };
}
```

50+ unit tests cover the capabilities; mirror an existing `*.test.ts` when adding a slice.

## Adding a capability slice — checklist

1. Create `capabilities/<context>/<slice>/` (or extend an existing consolidated slice).
2. Define entity + repository **port(s)** (`ports.ts` or inline).
3. Write the use-case(s) with a Zod command schema; emit catalog events.
4. Add any new event types to `kernel/event-catalog.ts`.
5. Export from the capability barrel and `src/index.ts`.
6. Add a `*.test.ts` with fakes + `FixedClock`/`SequentialIdGenerator`.
7. Implement the Drizzle adapter + wire the route (see
   [backend-api-patterns.md](backend-api-patterns.md)).
