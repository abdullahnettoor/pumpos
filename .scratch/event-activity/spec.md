# Hierarchical event activity

Status: Proposed for review

## Summary

PumpOS already stores immutable business events and usually records the authenticated tenant user who caused them. The missing pieces are readable descriptions, command-level grouping, explicit actor kinds, and a feed that presents related events as one activity.

This plan adds those pieces without renaming event types, replacing the event store, or rewriting every use case at once. The infrastructure change is small. Description enrichment is broad, so it is split by capability and can ship in stages.

One logical command becomes one activity group. The primary event appears as the group summary. Sibling facts from the same command remain visible inside an accordion. Each event keeps its own identity, payload, actor, timestamp, and any true causal relationship.

Example:

```text
Recorded a purchase from Bharat Petroleum: 3 items for ₹82,500.00
by Abdullah Nettoor · Main Road Station · 22 Aug, 10:42
▾ 4 related events

  Received 8,000 L of Diesel
  Received 4,000 L of Petrol
  Received 12 cans of Engine Oil
  Recorded supplier invoice BPCL-4821 for ₹82,500.00
```

## Goals

1. Give every catalogued business event a short human-readable title and description template.
2. Capture the display values needed by a description when the event occurs.
3. Make every action traceable to an explicit tenant-user, platform-admin, or system actor.
4. Group all events produced by one logical command.
5. Preserve `causationId` only for events actually triggered by another event.
6. Show one compact activity row per command, with same-command events in an accordion.
7. Keep old events readable through a generic fallback.
8. Roll out the work by capability without blocking normal business writes.

## Non-goals

- Renaming or removing existing values in `BusinessEvents`.
- Turning PumpOS into a fully event-sourced system.
- Replacing business tables with event projections.
- Adding an external event bus.
- Reconstructing historical names from current customer, product, supplier, or account records.
- Storing rendered English prose as the authoritative business fact.
- Localizing the whole application in this effort. The renderer should be locale-ready, but the first template set is English with Indian number and currency formatting.
- Exposing the activity feed to more roles. It remains Owner-only unless permissions are reviewed separately.

## Current state

### Event envelope

`packages/core/src/kernel/event.ts` already defines:

- `eventId`
- `eventType`
- `organizationId`
- `stationId`
- `businessDayId`
- `aggregateType`
- `aggregateId`
- `occurredAt`
- `recordedAt`
- `actorId`
- `correlationId`
- `causationId`
- `payload`
- `metadata`

The database table in `packages/db/src/schema.ts` stores all of these fields.

### Actor traceability

`apps/api/src/infra/context.ts` sets `actorId` from the authenticated user. `GET /activity` joins the event to `users.full_name`, and the UI displays that current name in a secondary metadata line.

This provides identity-level traceability for tenant users. It does not preserve the actor's name or role at the time of the action. A later user rename or role change alters the text shown for an older event.

Platform back-office actions are different. `buildPlatformEvent()` writes `actorId: null` because platform administrators do not have tenant `users` rows, then stores `metadata.platformActorEmail`. A null `actorId` therefore does not always mean `System`.

### Descriptions

`packages/ui/src/utils/eventLog.ts` contains a partial `EVENT_LABELS` map and a small `eventDetail()` helper. The helper only knows a few payload fields. It cannot render customer, product, supplier, account, tank, dispenser, nozzle, or document names when the event contains only IDs.

### Relationships

`correlationId` and `causationId` exist but normal API commands leave both null. Multi-event use cases therefore produce independent feed rows. Most events emitted together today are sibling facts from one command, not events caused by one another.

### Feed

`GET /activity` returns raw event rows, including the payload. `ActivityFeed` renders one line per event. A purchase, credit sale, stock count, or shift close can therefore create several adjacent rows for one operator action.

### Catalog coverage

The catalog currently contains 84 event types. Sixteen do not have a current core emitter. Some are future-only, but some correspond to live mutations that currently bypass core events. `HANDOVER_RECORDED` is the clearest example. The plan therefore audits mutating routes as well as catalog-to-emitter coverage.

## Design decisions

### 1. A description is a projection of an immutable event

The event stores facts and display snapshots. The activity renderer combines those values with a registered template.

The rendered sentence is not written into a new database column. This avoids duplicated prose and allows copy corrections without changing the underlying event.

### 2. Display snapshots are captured at write time

A historic event must not depend on the current name of a mutable record.

For example, a credit-sale event records both:

- `customerId`, for identity and navigation
- `customerName`, for the historic description

The same rule applies to products, suppliers, vehicles, financial accounts, categories, tanks, dispensers, nozzles, shift templates, users affected by an action, and document numbers. The station label shown beside a row remains current navigational context unless a template itself names the station. Station creation and update templates capture the action-time station name.

Notes, phone numbers, email addresses, tax identifiers, and other free text are not copied into activity metadata unless a reviewed template explicitly needs them.

### 3. Grouping, presentation, and actor metadata are separate

Business payloads keep their existing domain fields. Grouping role, template values, and actor snapshots live under separate reserved metadata namespaces.

Proposed contract:

```ts
export interface EventGroupingMetadata {
  role: 'primary' | 'related';
}

export interface EventActorSnapshot {
  kind: 'tenant_user' | 'platform_admin' | 'system';
  displayName: string;
  role: string | null;
  subjectId?: string | null;
}

export interface DomainEventMetadata {
  grouping?: EventGroupingMetadata;
  presentation?: EventPresentationInput;
  actorSnapshot?: EventActorSnapshot;
  [key: string]: unknown;
}
```

`EventPresentationInput` is a discriminated union keyed by template ID. Each template ID maps to a specific values type. An emitter that omits `customerName`, misspells `quantity`, or passes the wrong value type should fail TypeScript compilation.

Reasons:

- Grouping can roll out before specific descriptions.
- IDs and domain values remain in `payload`.
- Description-only snapshots do not force payload contract changes for event consumers.
- The existing JSONB `metadata` column avoids an event-table rewrite.
- The event and its audit presentation data still commit atomically.

### 4. Templates are registered code, not event-provided strings

Events store a template ID and typed plain values. They never store executable templates or HTML.

Example definition:

```ts
{
  id: 'credit-sale.product.v1',
  eventType: BusinessEvents.CREDIT_SALE_CREATED,
  title: 'Credit sale recorded',
  template: 'Recorded a credit sale to {customerName}: {quantity} {unit} of {productName} for {amount}.',
  formats: {
    quantity: 'decimal',
    amount: 'inr',
  },
  tone: 'success',
}
```

An amount-only credit sale uses a separate template:

```ts
{
  id: 'credit-sale.amount-only.v1',
  eventType: BusinessEvents.CREDIT_SALE_CREATED,
  title: 'Credit sale recorded',
  template: 'Recorded a credit sale to {customerName} for {amount}.',
  formats: { amount: 'inr' },
  tone: 'success',
}
```

Separate templates avoid awkward optional grammar.

Template IDs are permanent once events reference them. Copy can be corrected without changing the ID when the required values and meaning stay the same. A changed value contract or changed meaning gets a new versioned ID.

### 5. Description rendering is a deep module in `@pump/core`

Add a module near the event catalog, likely `packages/core/src/kernel/event-activity.ts`.

Its public interface should stay small:

```ts
renderEventActivity(event, options?): RenderedEventActivity
getEventActivityDefinition(eventType): EventActivityDefinition
```

It owns:

- template lookup
- placeholder replacement
- INR formatting
- decimal and quantity formatting
- fallback titles
- fallback descriptions
- missing-value handling
- plain-text output
- tone selection

The renderer must not throw because a presentation value is missing. It returns a generic fallback and may expose a diagnostic flag for logging and tests. A description problem must never fail a sale, payment, shift close, or other business command.

### 6. One logical command gets one correlation ID

`correlationId` means "all events produced by one accepted logical command."

It is not always identical to an HTTP request:

- A normal mutation request contains one command and gets one correlation ID.
- Customer creation plus opening balance is one composite command and shares one correlation ID.
- Purchase plus immediate supplier payment is one composite command and shares one correlation ID.
- Sale plus customer creation is one composite command and shares one correlation ID.
- Each row in a bulk product import is its own command and gets its own correlation ID.
- An idempotent replay returns the cached response and creates no new correlation ID or events.

`buildContext()` should generate a UUID when the caller does not supply one. Composite routes create a `CommandTrace` once and pass it to each context. The trace carries only the correlation ID. Each context receives its grouping role separately.

```ts
interface CommandTrace {
  correlationId: string;
}
```

The trace is shared. `buildContext()` receives `groupingRole` separately for each nested use case. A standalone use case defaults to primary. A nested use case in a composite command receives `groupingRole: 'related'`. Multi-event use cases explicitly mark their local lead and sibling events without changing their result types. Small helpers such as `trace.primaryContext(...)` and `trace.relatedContext(...)` may reduce route mistakes, but the shared trace itself does not carry one fixed role.

This keeps normal route changes small. Composite and bulk routes need focused edits, so ticket 02 must inventory every route that invokes more than one mutating use case.

### 7. `causationId` keeps its strict causal meaning

`causationId` means "the event that directly triggered this event." It is not a UI parent pointer.

Events emitted together by one command are normally siblings. For example, `PURCHASE_CREATED`, `GOODS_RECEIVED`, and `SUPPLIER_INVOICE_CREATED` are facts produced by `RecordPurchase`. `PURCHASE_CREATED` did not trigger the others. They share `correlationId`; they do not receive fabricated causation IDs.

Use `causationId` only when an event handler or later workflow consumes one event and emits another. A reaction completed inside the same accepted command may retain that command's correlation ID. A later command gets a new correlation ID and points `causationId` to the source event. If PumpOS later needs cross-command workflow tracing, add a separate workflow identifier. No current same-use-case fan-out is assumed to meet the causation rule.

The event marked `metadata.grouping.role = 'primary'` is the activity-group summary. Sibling facts use `role = 'related'`. The first UI is a one-level accordion of related events. A future true causal chain may be indented inside that list, but it is not required for this release.

### 8. Every new group has exactly one primary event

For a single-event command, that event is primary.

For known multi-event commands:

| Command | Primary event | Related sibling events |
|---|---|---|
| Open shift with lazy business day | `SHIFT_OPENED` | `BUSINESS_DAY_OPENED` |
| Close shift | `SHIFT_CLOSED` | `CASH_DECLARED` |
| Create product with opening stock | `PRODUCT_CREATED` | `INVENTORY_ADJUSTED` |
| Record non-credit sale through current `CreateSale` | `RETAIL_SALE_CREATED` | current `FUEL_SALE_RECORDED` fan-out, on generic fallback only |
| Record credit sale through current `CreateSale` | `CREDIT_SALE_CREATED` | `RETAIL_SALE_CREATED` and current fuel fan-out when present |
| Record standalone credit sale | `CREDIT_SALE_CREATED` | none today |
| Record purchase | `PURCHASE_CREATED` | `GOODS_RECEIVED`, `SUPPLIER_INVOICE_CREATED` |
| Record purchase and pay now | `PURCHASE_CREATED` | purchase siblings, `SUPPLIER_PAID`, `PAYMENT_MADE` |
| Pay supplier | `SUPPLIER_PAID` | `PAYMENT_MADE` |
| Record stock count | `TANK_DIP_RECORDED` or `PHYSICAL_COUNT_COMPLETED` | `VARIANCE_RECORDED` when non-zero |
| Create customer with opening balance | `CUSTOMER_CREATED` | `CUSTOMER_OPENING_BALANCE_SET` |
| Create supplier with opening balance | `SUPPLIER_CREATED` | `SUPPLIER_OPENING_BALANCE_SET` |
| Create sale with a new customer | the sale or credit-sale event representing the submitted command | `CUSTOMER_CREATED` and other sibling facts |

Legacy null-correlation events remain visible as synthetic one-event groups. Post-rollout correlated groups must contain exactly one primary event. Add a unique partial database index on `(organization_id, correlation_id)` for rows marked primary to prevent duplicate primaries. Core and API tests guarantee that each logical command emits at least one primary. A correlated group with no primary is malformed audit data; the normal feed reports a diagnostic and does not invent a summary. Provide an administrative repair script or documented SQL inspection path rather than silently changing append-only events.

#### Fuel-sale domain blocker

The current `CreateSale` path can emit `FUEL_SALE_RECORDED` from directly entered sale lines. That conflicts with the repository rule that Fuel Sales derive from Nozzle Reading deltas and are never manually entered or used to move stock again.

This activity effort must not formalize that conflict. Ticket 02 still has to assign one primary and related roles to every currently executable `CreateSale` fan-out so grouping cannot break sale writes. `FUEL_SALE_RECORDED` stays on a generic fallback and appears only as a related same-command fact. Before giving it a specific template or richer semantics, resolve the Sale/Fuel Sale implementation against `CONTEXT.md` and the project rules. A standalone fuel-on-credit entry may describe customer, product, quantity, and amount as a receivable fact, but it must not claim a causal link to a Fuel Sale unless a real immutable source-event reference exists.

### 9. Actor identity, kind, and display are separate

For tenant-user events, `actorId` remains the authoritative tenant identity.

New events also capture an explicit actor kind:

```ts
metadata.actorSnapshot = {
  kind: 'tenant_user',
  displayName: user.fullName ?? user.email ?? 'Unknown user',
  role: user.role,
  subjectId: user.id,
};
```

`ExecutionContext` gains an optional actor snapshot. A shared API authenticated-principal type supplies full name, email, and role to `buildContext()`. This replaces the narrower duplicated router user types.

Platform events preserve their current `platformActorEmail` compatibility and add:

```ts
metadata.actorSnapshot = {
  kind: 'platform_admin',
  displayName: platformAdmin.email,
  role: 'Platform Admin',
  subjectId: platformAdmin.subjectId ?? null,
};
```

A true system event explicitly stores `kind: 'system'`. The renderer never infers `System` from `actorId: null` alone.

The activity response always includes actor kind and the actor ID or subject ID when available. The UI shows `by {displayName}`. A related event shows its actor only when it differs from the primary event.

Legacy fallback order:

1. `metadata.actorSnapshot`
2. tenant `actorId` joined to current full name or email
3. legacy `metadata.platformActorEmail` as a platform administrator
4. `Unknown actor`

Only an explicit system actor displays `System`.

### 10. Legacy events remain immutable

Events written before this feature have null correlation IDs and no activity metadata.

Each legacy event becomes a one-event synthetic group whose group ID is its `eventId`. The renderer uses the current generic event label and safe payload details. It does not query current customer, product, or supplier records to invent historical names.

No bulk backfill is planned. A backfill could assign false historic meaning and would write to an append-only audit table.

## Event activity module

### Catalog shape

Never rename or remove existing `BusinessEvents` values. The mutation audit may add new append-only event types when a live meaningful action has no truthful catalog entry. Every addition must include its presentation definition and emitter tests in the same change. Add a separate presentation catalog so event identity and presentation concerns remain distinct.

Suggested shape:

```ts
export interface EventActivityDefinition {
  eventType: BusinessEventType;
  defaultTitle: string;
  defaultTone: EventTone;
  templates: readonly EventActivityTemplateDefinition[];
}

export const EventActivityCatalog = {
  [BusinessEvents.CREDIT_SALE_CREATED]: {
    defaultTitle: 'Credit sale recorded',
    defaultTone: 'success',
    templates: [creditSaleProductV1, creditSaleAmountOnlyV1],
  },
  // all other BusinessEvents
} satisfies Record<BusinessEventType, EventActivityDefinition>;
```

The `satisfies` check makes a missing event type a compile error. A generated or handwritten `TemplateValuesById` map powers a discriminated `EventPresentationInput` union, so each emitter's values are checked against its template ID.

### Value formats

Initial format kinds:

- `text`
- `integer`
- `decimal`
- `inr`
- `date`
- `volume-litres`
- `quantity`
- `percentage`

Formatting rules:

- Use `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` for money.
- Keep raw amounts and quantities numeric or numeric strings in event metadata. Do not store formatted currency strings.
- Normalize negative variance copy so the sign remains visible.
- Do not render `null`, `undefined`, `NaN`, or unresolved placeholders into user-facing text.
- Return plain text only. React continues to escape it.

### Creation helpers

Extend `ContextEventInput` with separate optional grouping and typed presentation fields:

```ts
groupingRole?: 'primary' | 'related';
presentation?: EventPresentationInput;
```

`eventFromContext()` writes them to reserved metadata and merges the actor snapshot. The grouping role defaults from the command trace, then to `primary` for a standalone command.

Add a related-event helper for sibling facts:

```ts
relatedEventFromContext(ctx, input)
```

It copies the command correlation and sets grouping role to `related`. It does not set `causationId`.

Do not add a generic caused-event helper until a real event-triggered workflow needs it. When that happens, its interface must distinguish a reaction inside the current command from a later command. A later command keeps the source `causationId` but gets a new `correlationId`.

Callers still provide event type, aggregate, payload, template ID, and values. The related-event helper constructs standard grouping metadata; it does not hide domain behavior.

## Initial template copy

The final wording should be reviewed as product copy before implementation. The following list defines the intended information and concise tone.

### Identity and station setup

| Event | Template intent |
|---|---|
| `ORGANIZATION_CREATED` | Created organization {organizationName}. |
| `ORGANIZATION_DEACTIVATED` | Deactivated organization {organizationName}. |
| `ORGANIZATION_REACTIVATED` | Reactivated organization {organizationName}. |
| `OWNER_INVITE_RESENT` | Resent the owner invitation to {email}. |
| `OWNER_INVITE_REVOKED` | Revoked the owner invitation for {email}. |
| `STATION_CREATED` | Added station {stationName}. |
| `STATION_UPDATED` | Updated station {stationName}. |
| `USER_CREATED` | Added {userName} as {role}. |
| `USER_INVITED` | Invited {userName} as {role}. |
| `USER_PASSWORD_RESET` | Sent a password reset to {userName}. |
| `USER_DEACTIVATED` | Deactivated {userName}. |
| `USER_REACTIVATED` | Reactivated {userName}. |
| `USER_UPDATED` | Updated {userName}. |
| `PRODUCT_CREATED` | Added product {productName}. |
| `PRODUCT_UPDATED` | Updated product {productName}. |
| `PRICE_CHANGED` | Changed {productName} price to {unitPrice}/L. |
| `PAYMENT_TERMINAL_REGISTERED` | Added payment terminal {terminalName}. |
| `PAYMENT_TERMINAL_UPDATED` | Updated payment terminal {terminalName}. |
| `TANK_CREATED` | Added tank {tankName} for {productName}. |
| `TANK_UPDATED` | Updated tank {tankName}. |
| `TANK_DELETED` | Removed tank {tankName}. |
| `DISPENSER_CREATED` | Added dispenser {dispenserName}. |
| `DISPENSER_UPDATED` | Updated dispenser {dispenserName}. |
| `DISPENSER_DELETED` | Removed dispenser {dispenserName}. |
| `NOZZLE_CREATED` | Added nozzle {nozzleName} for {productName}. |
| `NOZZLE_UPDATED` | Updated nozzle {nozzleName}. |
| `NOZZLE_DELETED` | Removed nozzle {nozzleName}. |
| `SHIFT_TEMPLATE_CREATED` | Added shift template {templateName}. |
| `SHIFT_TEMPLATE_UPDATED` | Updated shift template {templateName}. |
| `SHIFT_TEMPLATE_DELETED` | Removed shift template {templateName}. |
| `ONBOARDING_COMPLETED` | Completed onboarding for {stationName}. |

### Station operations

| Event | Template intent |
|---|---|
| `BUSINESS_DAY_OPENED` | Opened business day {businessDate}. |
| `BUSINESS_DAY_CLOSED` | Closed business day {businessDate}. |
| `SHIFT_OPENED` | Opened {shiftName} shift with {openingCash}. |
| `SHIFT_CLOSED` | Closed {shiftName} shift with a cash variance of {cashVariance}. |
| `SHIFT_REOPENED` | Reopened {shiftName} shift. |
| `SHIFT_LOCKED` | Locked {shiftName} shift. |
| `ATTENDANT_ASSIGNED` | Assigned {attendantName} to {duName} for {shiftName} shift. |
| `NOZZLE_READING_RECORDED` | Recorded {readingCount} nozzle readings totaling {volume} L. |
| `CASH_DECLARED` | Declared {closingCash} cash for {shiftName} shift. |
| `HANDOVER_RECORDED` | Recorded {attendantName}'s handover for {duName}. |
| `DSSR_GENERATED` | Generated DSSR for {businessDate}, covering {shiftCount} shifts. |

### Retail and CRM

| Event | Template intent |
|---|---|
| `FUEL_SALE_RECORDED` | Generic `Fuel sale recorded` fallback until the Fuel Sale domain blocker is resolved. |
| `RETAIL_SALE_CREATED` | Recorded {itemSummary} for {amount} via {paymentMethod}. |
| `RETAIL_SALE_VOIDED` | Voided sale {documentNumber} for {amount}. |
| `RETAIL_SALE_RETURNED` | Returned {itemSummary} for {amount}. |
| `DISCOUNT_APPLIED` | Applied a {discountAmount} discount to sale {documentNumber}. |
| `CUSTOMER_CREATED` | Added customer {customerName}. |
| `CUSTOMER_UPDATED` | Updated customer {customerName}. |
| `CUSTOMER_OPENING_BALANCE_SET` | Set {customerName}'s opening balance to {amount} as of {asOfDate}. |
| `VEHICLE_ADDED` | Added vehicle {registrationNumber} for {customerName}. |
| `VEHICLE_UPDATED` | Updated vehicle {registrationNumber}. |
| `VEHICLE_REMOVED` | Removed vehicle {registrationNumber}. |
| `CREDIT_LIMIT_CHANGED` | Changed {customerName}'s credit limit to {creditLimit}. |
| `CREDIT_SALE_CREATED` | Recorded a credit sale to {customerName}: {itemSummary} for {amount}. |
| `CREDIT_SALE_VOIDED` | Voided a credit sale to {customerName} for {amount}. |
| `CREDIT_PAYMENT_RECEIVED` | Received {amount} from {customerName} via {paymentMethod}. |
| `OMC_CARD_SALE_CREATED` | Recorded an OMC card sale for {customerNameOrCard}: {itemSummary} for {amount}. |
| `OMC_CARD_SALE_VOIDED` | Voided an OMC card sale for {customerNameOrCard} for {amount}. |

### Inventory and purchasing

| Event | Template intent |
|---|---|
| `STOCK_MOVEMENT_RECORDED` | Recorded {movementType} of {quantity} {unit} of {productName}. |
| `FUEL_RECEIVED` | Received {quantity} L of {productName} into {tankName}. |
| `TANK_DIP_RECORDED` | Recorded a dip for {tankName}: {actualQuantity} L, variance {varianceQuantity} L. |
| `TANK_TRANSFER_COMPLETED` | Transferred {quantity} L of {productName} from {fromTankName} to {toTankName}. |
| `INVENTORY_ADJUSTED` | Adjusted {productName} stock by {quantity} {unit}. |
| `PHYSICAL_COUNT_COMPLETED` | Counted {actualQuantity} {unit} of {productName}, variance {varianceQuantity} {unit}. |
| `VARIANCE_RECORDED` | Recorded a {varianceQuantity} {unit} variance for {productName}. |
| `SUPPLIER_CREATED` | Added supplier {supplierName}. |
| `SUPPLIER_UPDATED` | Updated supplier {supplierName}. |
| `PURCHASE_CREATED` | Recorded a purchase from {supplierName}: {lineCount} items for {amount}. |
| `PURCHASE_APPROVED` | Approved purchase {documentNumber} from {supplierName}. |
| `GOODS_RECEIVED` | Received {quantity} {unit} of {productName} from {supplierName}. |
| `SUPPLIER_INVOICE_CREATED` | Recorded invoice {invoiceNumber} from {supplierName} for {amount}. |
| `SUPPLIER_PAID` | Paid {supplierName} {amount} from {accountName}. |
| `SUPPLIER_OPENING_BALANCE_SET` | Set {supplierName}'s opening balance to {amount} as of {asOfDate}. |

### Finance

| Event | Template intent |
|---|---|
| `EXPENSE_RECORDED` | Recorded {categoryName} expense of {amount} from {accountName}. |
| `EXPENSE_VOIDED` | Voided {categoryName} expense of {amount}. |
| `INCOME_RECORDED` | Recorded {categoryName} income of {amount} into {accountName}. |
| `INCOME_VOIDED` | Voided {categoryName} income of {amount}. |
| `PAYMENT_RECEIVED` | Received {amount} from {partyName} into {accountName}. |
| `PAYMENT_MADE` | Paid {amount} to {partyName} from {accountName}. |
| `INVOICE_GENERATED` | Generated invoice {invoiceNumber} for {amount}. |
| `FINANCIAL_ACCOUNT_CREATED` | Added financial account {accountName}. |
| `FINANCIAL_ACCOUNT_UPDATED` | Updated financial account {accountName}. |
| `LEDGER_ENTRY_POSTED` | Posted {ledgerSummary}. |

`LEDGER_ENTRY_POSTED` requires separate templates for transfers, merchant settlements, and manual adjustments. It should not rely on one vague sentence in implementation.

## Payload and dependency enrichment

Descriptions can only use values that the use case has verified inside the tenant scope.

### Priority 1

These are the highest-volume or money-sensitive events:

- retail sales
- standalone credit sales
- OMC card sales
- customer collections
- expenses
- income
- purchases
- supplier payments
- stock counts and variances
- shift open and close
- DSSR generation

Required additions include customer names, supplier names, product summaries, category names, account names, shift names, document numbers, quantities, units, payment methods, and amounts.

Some use cases already load the needed entity. Others need a repository port added. For example, standalone credit sales accept `productId` but do not currently load the product. Add the existing product repository port rather than querying SQL from core.

### Priority 2

Setup and maintenance events:

- stations
- users
- products and prices
- payment terminals
- tanks
- dispensers
- nozzles
- shift templates
- customers, suppliers, and vehicles
- financial accounts

Update and delete events must capture the target's pre-change or resulting display name. Delete events use the pre-delete name.

### Priority 3

Catalogued events without current emitters receive catalog templates now. Their future implementation must provide the registered values before the emitter is considered complete.

## Activity read model

### Response types

Do not return raw event payloads from the default activity endpoint.

Proposed summary response:

```ts
interface ActivityActor {
  kind: 'tenant_user' | 'platform_admin' | 'system' | 'unknown';
  id: string | null;
  displayName: string;
  role: string | null;
}

interface ActivityEventItem {
  eventId: string;
  eventType: string;
  title: string;
  description: string;
  tone: EventTone;
  actor: ActivityActor;
  stationId: string | null;
  stationName: string | null;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  recordedAt: string;
  causationId: string | null;
  groupingRole: 'primary' | 'related';
  renderStatus: 'rendered' | 'fallback';
}

interface ActivityGroupSummary {
  groupId: string;
  primary: ActivityEventItem;
  relatedCount: number;
  primaryRecordedAt: string;
}

interface ActivityGroupDetail extends ActivityGroupSummary {
  related: ActivityEventItem[];
}

interface ActivityPage {
  items: ActivityGroupSummary[];
  nextCursor: string | null;
}
```

### Endpoints

Keep the existing route name because ad blockers may block `/events`.

```text
GET /api/activity
GET /api/activity/:groupId
```

`GET /activity` returns group summaries. It limits groups, not raw event rows.

Supported filters:

- `stationId`
- `type`
- `limit`
- `cursor`

Filter behavior:

- A group matches when any event in it matches the requested station or type.
- The response still returns the group's primary event for context.
- Expanding the group returns all related events in that tenant-scoped group.

Pagination:

- Sort groups by the primary event's `recordedAt`, then `eventId`, both descending.
- Use an opaque cursor containing both values.
- Return `{ items, nextCursor }` inside the standard success envelope.
- Default to 50 groups and cap at 200.
- Reject malformed cursors with a validation error.
- The UI provides Load more or infinite scrolling, so older activity remains reachable.

`GET /activity/:groupId`:

- Treats the UUID as `correlationId` for new groups.
- Falls back to `eventId` for a legacy one-event group.
- Always scopes by `organizationId` before returning data.
- Returns related same-command siblings ordered by `recordedAt`, then `eventId`.
- Preserves any true `causationId` as audit data but does not invent a tree from co-emitted events.

### Query shape and indexes

Do not aggregate the organization's full event history with `MAX(recorded_at)` on every page. New groups have one row marked `metadata.grouping.role = 'primary'`, so the summary query seeks directly through primary rows. Legacy null-correlation events act as primary rows.

Prototype the exact SQL and run `EXPLAIN (ANALYZE, BUFFERS)` before finalizing indexes. The initial candidates are:

```text
partial activity-primary index on (organization_id, recorded_at DESC, event_id DESC)
correlation detail index on (organization_id, correlation_id, recorded_at, event_id)
```

The partial index predicate covers explicit primary metadata and legacy null-correlation rows. Add a unique partial index on `(organization_id, correlation_id)` for non-null correlations marked primary. This prevents duplicate primary rows. It does not prove that a group has a primary, so diagnostics must detect related-only groups.

Station and type filters that match any group member may need `EXISTS` subqueries and measured filter-specific indexes. Add those only when representative query plans justify them. Do not add `(organization_id, causation_id)` merely for the accordion because group detail reads by correlation ID.

## UI behavior

### Group row

The collapsed row shows:

- primary description
- `by {actor}`
- station
- timestamp
- related-event count when non-zero
- event-type tag in a subdued technical style
- tone indicator

The description is the primary text. The raw event type is supporting audit information.

### Accordion

- Closed by default.
- Only rendered when `relatedCount > 0`.
- Fetches group detail when first expanded.
- Caches detail with the operational TanStack Query tier.
- Shows a compact loading state inside the row.
- Keeps fetched detail while the accordion is closed.
- Shows related sibling events in chronological order.
- May indent a true causal child in the future, but the first release is one level.
- Shows a related event's actor only when it differs from the primary actor.
- Uses a real button with `aria-expanded` and `aria-controls`.
- Supports keyboard activation and visible focus.
- Does not animate height when the user requests reduced motion.

### Legacy row

A legacy event has no accordion unless the server finds correlated records. It displays the generic fallback description and a small fallback indicator only in development or diagnostics, not to normal users.

### Data fetching

Follow the PumpOS caching rules during implementation:

- Keep activity group summaries on the operational tier.
- Add centralized query keys for summary pages and group details, including station, type, limit, cursor, and group ID as appropriate.
- Use `useInfiniteQuery` or an explicit Load more query for summary pagination.
- Invalidate activity queries after relevant mutations if the existing broad operational invalidation does not already include them.
- Do not persist activity payloads in the static or semi-static cache.

## Rollout plan

### Stage 1: Core contract and renderer

- Add separate grouping, typed presentation, and actor snapshot types.
- Add the complete catalog and fallback labels for all 84 event types.
- Add the renderer and formatting tests.
- Add compile-time catalog coverage.
- Keep the existing feed behavior.

Result: the description contract exists, but no business behavior changes.

### Stage 2: Correlation, actor snapshots, and relationships

- Generate correlation IDs in `buildContext()` by default.
- Share IDs explicitly across composite commands.
- Keep one ID per row for bulk imports.
- Introduce one shared authenticated-principal type for API routers.
- Capture explicit tenant-user, platform-admin, and system actor kinds.
- Update direct platform event construction to generate correlation, primary grouping, and platform actor metadata without relying on `buildContext()`.
- Assign primary and related roles to existing fan-out and composite commands.
- Keep same-command sibling events flat under correlation.
- Leave `causationId` untouched unless a real event-triggered reaction exists.

Result: new events become traceable groups even before every description is rich.

### Stage 3: Priority 1 event enrichment

- Build an event-by-event value-source matrix before changing constructor interfaces.
- Add typed presentation metadata and stable display values to operational and money events.
- Batch-load line-item names where needed and prevent N+1 queries.
- Do not add a repository dependency solely for prose when an adapter can safely add presentation-only context.
- Standardize overloaded event payload variants where practical, without renaming event types.
- Resolve the current `FUEL_SALE_RECORDED` domain conflict before enriching that path.
- Add use-case tests for the new metadata and grouping.

Result: the most important activity groups have complete descriptions.

### Stage 4: Hierarchical activity endpoints

- Add primary-row queries, cursor pagination, legacy handling, actor fallback, and lazy related-event details.
- Stop returning raw payloads from the summary endpoint.
- Add indexes and API tests.

Result: the server can support the accordion without duplicate top-level rows.

### Stage 5: Accordion UI

- Add typed activity response models.
- Add group-summary and group-detail query hooks.
- Replace UI-side labels and `eventDetail()` with server-rendered text.
- Implement the accessible accordion.

Result: users see one activity row per command.

### Stage 6: Priority 2 and 3 event enrichment

- Cover setup and lower-frequency events.
- Audit every mutating route, not only current emitters.
- Verify the Stage 3 `HANDOVER_RECORDED` repair.
- Classify each other direct mutation as event-emitting or explicitly non-business.
- Keep catalog-only templates ready only for genuinely future events.
- Remove obsolete UI fallback mappings after API fallback coverage is proven.

Result: all emitted event types have specific descriptions.

### Stage 7: Documentation and hardening

- Update `CONTEXT.md` with the agreed terms `Activity Group`, `Primary Event`, and `Related Event` if the review accepts them.
- Record the correlation and activity-metadata decision in an ADR because the semantics affect every future emitter.
- Add contributor guidance and an emitter checklist.
- Run full builds and tests.

## Testing strategy

### Core unit tests

- Every `BusinessEventType` has an activity definition.
- Every template ID is unique.
- Every placeholder has a declared format.
- Required values render correctly.
- INR uses Indian grouping.
- Decimal and litre values retain sensible precision.
- Missing templates and missing values return fallback copy without throwing.
- Template values cannot inject HTML.
- `eventFromContext()` captures actor snapshots and grouping role.
- Template-ID-to-values typing rejects missing or wrongly typed values.
- Same-command helper functions copy correlation without assigning causation.

### Use-case tests

For each enriched emitter, assert:

- business payload remains correct
- `activity.templateId` is correct
- `metadata.grouping.role` is correct
- display snapshots contain the action-time values
- co-emitted sibling events do not receive fabricated causation IDs
- all events in the command share one correlation ID
- tenant checks happen before names enter event metadata

Priority scenarios:

1. Credit fuel sale with customer, product, quantity, unit price, and amount.
2. Credit sale without product or quantity, using the amount-only template.
3. Customer renamed after sale, with old event metadata unchanged.
4. Purchase with several products and one supplier invoice.
5. Supplier payment producing payment and ledger-related events.
6. Stock count with and without variance.
7. Shift close with zero, positive, and negative cash variance.
8. Explicit system event.
9. Platform-admin event with null tenant actor ID and a preserved platform identity.
10. Composite customer or supplier creation with opening balance.
11. Purchase with immediate supplier payment.
12. Sale with customer creation.
13. Bulk product import producing separate groups per row.

### API tests

- Owner can list activity groups.
- Other roles remain forbidden.
- Organization scope prevents cross-tenant groups and related events.
- Station and type filters match groups through related events.
- Group limits apply to groups, not rows.
- Cursor pagination has no duplicates or gaps for tied timestamps and a stable dataset.
- Concurrent new activity does not duplicate older cursor pages.
- Group detail returns all same-command sibling events.
- Legacy null-correlation events appear as one-event groups.
- Actor snapshot wins over the current user name.
- Legacy platform actor metadata does not display as System.
- Raw payload is absent from the summary response.

### UI tests

- One collapsed row appears for a multi-event group.
- Related count is correct.
- Expansion fetches details once and shows related sibling events.
- Load more or infinite pagination reaches older groups.
- Keyboard and screen-reader state are correct.
- Loading, empty, error, and legacy states render correctly.
- Different related-event actors are visible.
- Same related-event actors are not repeated on every line.

### Validation commands

Run the narrow checks first, then the broader workspace checks:

```sh
npm test --workspace=@pump/core
npm run build --workspace=@pump/core
npm run build --workspace=apps/api
npm run build --workspace=@pump/ui
npm test --workspaces --if-present
npm run build
```

Use the repository's actual workspace names if a script differs when implementation begins.

## Failure handling

- Description rendering never blocks a write.
- Missing activity metadata produces generic fallback copy.
- An unknown template ID produces generic fallback copy and a server diagnostic.
- A missing current user row does not erase actor identity. The response retains `actorId` and uses the snapshot or `Unknown actor`.
- A null tenant actor ID does not imply System. Legacy platform actor metadata remains visible.
- The unique primary index rejects duplicate primaries. Related-only malformed groups are diagnosed and require explicit audit repair; the feed does not invent a primary.

## Security and privacy

- Keep Owner-only authorization for both activity endpoints.
- Scope every summary and related-event query by `organizationId`.
- Do not accept template strings from requests or event payloads.
- Render plain text only.
- Do not copy secrets, auth tokens, full notes, tax identifiers, phone numbers, or addresses into activity metadata.
- Do not expose raw event payloads from the group summary endpoint.
- Keep aggregate IDs available for future authorized navigation, but do not turn them into unrestricted record lookups.

## Performance expectations

- The summary endpoint seeks through indexed primary rows rather than aggregating all events.
- Related events load only when a group is expanded.
- The default page contains 50 activity groups.
- A normal collapsed feed must not fetch all related events for all groups.
- New indexes support organization timeline scans and correlation lookups.
- Template rendering is in-process and does not query the database.

## Acceptance criteria

1. Every `BusinessEvents` member has a catalog title, tone, and at least one template or explicit generic fallback.
2. Every meaningful new mutation emits events with a non-null correlation ID.
3. New actions contain an explicit actor snapshot; tenant-user actions also retain `actorId`.
4. Known multi-event and composite workflows mark exactly one event primary, with a partial unique index preventing duplicate primaries.
5. Co-emitted sibling facts share correlation but do not receive false causation IDs.
6. The activity list returns one summary per correlation group using primary-row pagination.
7. The accordion reveals all related events without creating duplicate top-level rows.
8. Credit-sale descriptions support both product-detail and amount-only cases.
9. Historic description values do not change when a customer, product, supplier, account, or affected user is renamed.
10. Legacy events remain visible without modification or fabricated names.
11. Cross-tenant access is impossible in list and detail queries.
12. Description failures never fail the underlying business action.
13. Tenant users, platform administrators, and system actions remain distinguishable.
14. Live handover writes emit `HANDOVER_RECORDED` transactionally with the current declaring-attendant and DU model.
15. Every executable `CreateSale` fan-out has one primary event, while the current manual `FUEL_SALE_RECORDED` path stays on generic fallback until its domain conflict is resolved.
16. Core, API, and UI builds pass, with focused tests covering grouping and rendering.

## Review questions

These points need explicit approval before implementation:

1. Should actor display name and role be snapshotted in metadata, or is immutable `actorId` plus the current user name sufficient?
2. Are separate `metadata.grouping`, `metadata.presentation`, and `metadata.actorSnapshot` namespaces accepted?
3. Should the first UI and response use one accordion level for same-command siblings, reserving `causationId` for true event reactions?
4. For composite commands, is the proposed command trace with primary and related nested-use-case roles acceptable?
5. Should a type filter return the whole matching group for context, or only matching events?
6. Is it acceptable to leave old events unmodified and use generic fallback descriptions?
7. Should template copy be English-only for this phase, with locale-ready formatting but no translation files yet?
8. Should the activity effort block enrichment of `FUEL_SALE_RECORDED` until its current direct-entry behavior is reconciled with the domain model?

## Planned tickets

1. `issues/01-core-activity-contract.md`
2. `issues/02-command-trace-and-relationships.md`
3. `issues/03-priority-event-enrichment.md`
4. `issues/04-grouped-activity-api.md`
5. `issues/05-activity-accordion-ui.md`
6. `issues/06-mutation-and-catalog-completion.md`
7. `issues/07-documentation-and-hardening.md`

## Comments

