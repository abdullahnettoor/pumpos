# PumpOS

The shared language for PumpOS, a multi-tenant fuel-station management platform
for Indian fuel retail. This is the glossary; hard rules live in `AGENTS.md`.
When writing issues, specs, tests, or code names, use these terms exactly.

## Time & Anchoring

**Business Day**:
One station's operating day, keyed by `(station, calendar date)`. The universal
anchor: every operational and financial record belongs to one. May run
06:00 → 06:00 per station config. Several may be open at once; a past day
closes independently without blocking today.
_Avoid_: operating day, trading day, diwas

**Business Date**:
The `YYYY-MM-DD` string that anchors a record to its Business Day, resolved
timezone-aware from the station's clock settings — never from UTC.
_Avoid_: date, today

**Day Start** (`business_day_starts_at`):
The station-local time before which instants roll back to the previous
Business Date.
_Avoid_: cutoff, open time

**Shift**:
An operator-accountability window inside a Business Day. A Business Day has one
or more Shifts; day-anchored financials need none.
_Avoid_: slot, rotation, session, duty

**Anchoring Rule**:
`business_day_id` anchors every record. `shift_id` is optional: set by default
for drawer-touching movements (sales, cash collections, drawer expenses,
drawer supplier payments, cash drops), NULL by default otherwise — but always
passable or preselectable when attributing a record to a shift window helps
future capabilities slice historical data. Drawer math keys off movement kind,
never off `shift_id` presence.
_Avoid_: linking everything to a shift; treating `shift_id` as drawer-math input

## Station Setup

**Organization**:
The tenant. Every table carries `organization_id`; data never leaks across.
_Avoid_: org, company, account

**Station**:
A physical fuel retail site within an Organization. Owns its timezone, Day
Start, tanks, dispensers, and nozzles.
_Avoid_: site, outlet, pump (reserved for the hardware sense)

**Dispenser**:
A fuel-dispensing unit at a Station holding one or more Nozzles.
_Avoid_: pump unit, du

**Nozzle**:
The metered dispensing point whose readings derive all Fuel Sales.
_Avoid_: hose, gun

## Fuel Operations

**Nozzle Reading**:
A meter snapshot taken on a Nozzle at a moment in a Shift. Opening readings
default from the previous closing.
_Avoid_: meter reading, dial reading

**Fuel Sale**:
Volume derived as Closing Reading − Opening Reading. Never entered manually;
never re-moves stock.
_Avoid_: pump sale, petrol sale

**Manual Sale**:
A non-fuel line item (engine oil, coolant, grease, accessories) recorded
directly, separate from Fuel Sales.
_Avoid_: product sale, lube sale, misc sale

## Money Movements

**Drawer**:
The physical cash box a Shift operator is accountable for. Only cash touches
it.
_Avoid_: till, cashbox, register

**Collection**:
Money received from a customer against dues or at point of sale. Cash
Collections touch the Drawer; card/UPI/bank/online Collections do not.
_Avoid_: receipt, payment-in

**Expense**:
Money paid out. Drawer Expenses hit the Drawer; bank/owner Expenses do not.
_Avoid_: cost, spend

**Supplier Payment**:
Money paid to a supplier. Cash payments touch the Drawer; bank payments do not.
_Avoid_: vendor payment, purchase payment

**Purchase**:
Stock bought from a supplier, anchored to the Business Day, never to a Shift.
_Avoid_: procurement, inward

**Credit Sale**:
A receivable: fuel sold on credit records only a customer-ledger debit. It is
not Drawer cash and never moves stock again.
_Avoid_: udhaar entry, due sale

**Customer Balance**:
Σ Credit Sales − Σ Collections for a customer. A ledger figure, never a drawer
figure.
_Avoid_: outstanding, khata

**Cash Drop**:
Cash moved out of the Drawer mid-shift (e.g., to a safe), reducing expected
drawer cash.
_Avoid_: safe drop, remittance

**Drawer Reconciliation**:
At shift close: `opening + cash sales + cash collections − drawer expenses −
drawer supplier payments − cash drops`. Card/UPI/bank/credit never enter it.
_Avoid_: cash count, tally

## Inventory

**Stock Movement**:
The single source of truth for inventory state. All quantity changes are
movements.
_Avoid_: stock entry, inventory adjustment

**Variance**:
Expected Stock − Actual Stock, always surfaced with a reason. First-class,
never hidden inside reports.
_Avoid_: difference, delta, shortage, loss

## Reports & Snapshots

**Shift Summary**:
Immutable snapshot created when a Shift closes: that shift's nozzle and drawer
reconciliation plus totals.
_Avoid_: shift report, closing report

**DSSR** (Daily Station Sales Report):
Immutable snapshot created when a Business Day closes: composes the day's
closed Shift Summaries plus day-anchored financials (collections, expenses,
purchases, supplier payments, credit sales).
_Avoid_: daily report, day summary

**Snapshot Immutability**:
Summaries are stored permanently, never recalculated historically, never
edited after generation; regeneration is explicit and idempotent.
_Avoid_: refresh, recompute

## Events & Resilience

**Business Event**:
The record of every meaningful action (`SHIFT_OPENED`, `SALE_RECORDED`, …),
carrying `event_id`, `event_type`, `organization_id`, `station_id`,
`entity_type`, `entity_id`. Drives sync, audit, and reporting; never bypassed.
_Avoid_: log entry, activity

**Transactional Outbox**:
The pattern where state changes and their events commit atomically in one
transaction (`runInTransaction`).
_Avoid_: event queue, side channel

**Write Outbox**:
The durable local queue (Tauri SQLite / IndexedDB) holding unsynced writes;
replays idempotently when connectivity returns. Cloud PostgreSQL stays
authoritative.
_Avoid_: offline store, cache write

**Level 2 Resilience**:
Online-primary with graceful degradation: queue writes, serve warm reads,
never block an operator action on the network. Not cold-start offline-first.
_Avoid_: offline mode
