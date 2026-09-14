# Priority event description enrichment

Type: task
Status: planned
Blocked by: 01, 02

## Objective

Add complete action-time description values to high-volume and money-sensitive event emitters.

## Scope

Cover:

- product retail sales
- standalone credit sales
- OMC card sales
- customer collections
- expenses and voids
- income and voids
- purchases
- supplier payments
- attendant handovers
- stock counts, dips, adjustments, and variances
- shift opening and closing
- DSSR generation
- invoices and financial ledger actions

## Implementation rules

- Build an event-by-event value-source matrix before changing constructor interfaces.
- Classify each value as already loaded, domain-required lookup, adapter-only context, or batch lookup.
- Capture both stable IDs and action-time display names.
- Reuse repository ports already loaded by the use case.
- Add a repository port dependency only when the lookup also enforces or supports domain behavior.
- Prefer transaction-scoped adapter enrichment when a value is presentation-only and safely available there.
- Never import an API repository or SQL into core.
- Batch-load line-item display values. Do not introduce N+1 queries.
- Missing presentation-only data must fall back; it must not reject the business command.
- Choose a complete template variant rather than leaving optional placeholders.
- Keep existing payload fields for consumers.
- Do not copy unrestricted notes into activity metadata.
- Mark exactly one primary event per logical command.
- Keep co-emitted facts as correlated siblings with no fabricated `causationId`.

## Required scenarios

### Fuel-sale blocker

Do not give the current direct-entry `FUEL_SALE_RECORDED` path a specific template until it is reconciled with the domain rule that Fuel Sales derive from Nozzle Reading deltas and never move stock again. Ticket 02 still groups the executable fan-out under one primary event so activity infrastructure cannot break sale writes. Keep the fuel event on generic fallback and record the semantic conflict as a blocking finding rather than normalizing it in activity copy.

### Credit sale

Product-detail template values:

- customer name
- product name
- quantity
- unit
- unit price when useful
- total amount
- vehicle registration when it materially helps identification

These values describe the receivable entry. They do not assert that this event caused or re-recorded a metered Fuel Sale.

Amount-only template values:

- customer name
- total amount

### Purchase

Primary description values:

- supplier name
- invoice or purchase document number when present
- line count
- total amount

Each related goods-received event captures product name, quantity, and unit.

### Finance

Capture category labels, account labels, party names, amounts, payment methods, document numbers, and void reasons only where the reason is reviewed for display.

### Handover

The live handover write path must emit `HANDOVER_RECORDED` inside the same transaction as its data changes. Match the current declaration model: capture the declaring attendant, DU, shift, and concise handover totals. Add a separate incoming-attendant template only if the domain model later records one. Do not copy unrestricted notes.

### Shift close

Capture shift name, declared cash, expected cash, and signed variance. The primary description should remain short. Detailed amounts can appear in related events.

## Tests

Extend the relevant use-case tests to assert template ID, role, display snapshots, correlation, and the absence of false causation. Include renamed-entity fixtures to prove descriptions do not use current master data at read time. Add query-count checks or repository-spy assertions for line-item enrichment.

## Acceptance criteria

- Every in-scope emitted event renders specific copy without querying mutable master data.
- Credit sales support product-detail and amount-only variants.
- Existing business payload assertions still pass.
- No N+1 lookups are added for multi-line commands.
- No unavailable presentation-only value can fail the business command.
- `HANDOVER_RECORDED` commits transactionally with the handover write.
- The fuel-sale blocker is resolved or explicitly remains excluded.
- Focused core tests pass.

## Comments

