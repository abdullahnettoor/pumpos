# Command trace and event grouping

Type: task
Status: planned
Blocked by: 01

## Objective

Populate explicit actor snapshots and correlation IDs for new events, then assign one primary event and related sibling roles per logical command.

## Scope

- Introduce one shared authenticated-principal type for all API routers and `buildContext()`.
- Extend `ExecutionContext` with an optional actor snapshot and default grouping role.
- Make API `buildContext()` capture authenticated display name, role, actor kind, and subject ID.
- Update direct platform event creation to generate a correlation ID, set primary grouping, and capture `platform_admin` actor snapshots while preserving legacy `platformActorEmail`.
- Require true system events to set actor kind `system` explicitly.
- Make `buildContext()` generate a UUID correlation ID when none is supplied.
- Add a `CommandTrace` helper containing the shared correlation ID. Pass `groupingRole` separately to each context, or expose explicit `primaryContext()` and `relatedContext()` factories.
- Update composite routes so every nested use case in one logical command shares the correlation ID and only the lead use case is primary.
- Keep one correlation ID per row in bulk imports.
- Merge actor snapshot, grouping, and presentation metadata safely in `eventFromContext()`.
- Add `relatedEventFromContext()` for same-command sibling facts. It must not set `causationId`.
- Do not add a caused-event helper until a real event-triggered workflow needs it. A later command gets a new correlation ID even when it points `causationId` to a source event.

## Composite-route inventory

At minimum, inspect and cover:

- customer creation plus opening balance
- supplier creation plus opening balance
- purchase plus immediate supplier payment
- sale plus customer creation
- any shift operation that invokes more than one mutating use case
- bulk product import, where each row must remain a separate group

The implementation ticket must finish a search-based inventory before editing routes. Do not assume the list above is complete.

## Initial grouping coverage

- Open shift and lazy business-day opening.
- Close shift and cash declaration.
- Product creation and opening stock adjustment.
- Every executable `CreateSale` fan-out. Non-credit flows use `RETAIL_SALE_CREATED` as primary. Credit flows use `CREDIT_SALE_CREATED` as primary. Current `FUEL_SALE_RECORDED` fan-out remains related with generic presentation fallback.
- Purchase, goods received, and supplier invoice.
- Supplier payment and generic payment made.
- Stock count and variance.
- Composite customer or supplier creation with opening balance.
- Purchase with immediate payment.

Specific Fuel Sale presentation enrichment is excluded until the direct-entry `FUEL_SALE_RECORDED` behavior is reconciled with the Fuel Sale domain rule. Grouping coverage is not excluded because every executable fan-out must have exactly one primary before the unique index is enabled.

## Trace rules

- Tenant `actorId` is the authoritative tenant-user identity.
- Actor kind distinguishes `tenant_user`, `platform_admin`, and `system`.
- A null tenant actor ID never implies System by itself.
- `correlationId` groups one logical command.
- `metadata.grouping.role` identifies the primary summary or a related sibling.
- `causationId` is used only when one event actually triggered another event.
- Co-emitted sibling facts do not receive fabricated causation links.
- Idempotent replay emits no duplicate group.

## Tests

- Normal command receives a non-null correlation ID.
- Composite commands share one correlation ID and have one primary event.
- Bulk rows receive different correlation IDs.
- Same-command siblings are related and have null causation IDs.
- Tenant actor snapshot survives a later user-name change in fixtures.
- Platform-admin event remains attributable when `actorId` is null.
- Explicit system actor renders as system later.
- Metadata supplied by a use case cannot silently erase context actor data.
- Existing true causation data, if any, remains untouched.
- Product-credit, current fuel, mixed, and sale-with-customer paths each produce one primary group without a duplicate-primary failure.

## Acceptance criteria

- New API-created events have a correlation ID.
- New tenant-user events have `actorId` and a tenant-user snapshot.
- New platform events have a platform-admin snapshot, correlation ID, and primary grouping role.
- Known fan-out and composite workflows have exactly one primary event.
- Same-command siblings share correlation without false causation.
- No database column migration is required.
- Core and API tests and builds pass.

## Comments

