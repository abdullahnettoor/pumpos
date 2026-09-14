# PumpOS

The shared language for PumpOS, a multi-tenant fuel-station management platform
for Indian fuel retail. This is the glossary; hard rules live in `AGENTS.md`.
When writing issues, specs, tests, or code names, use these terms exactly.

## Time & Anchoring

**Business Day**:
One station's operating day, keyed by `(station, Business Date)`. The universal
anchor: every operational and financial record belongs to one. May run
06:00 → 06:00 per station config. Several may be open at once; a past day
closes independently without blocking the Current Business Date.
_Avoid_: operating day, trading day, diwas

**Business Date**:
The `YYYY-MM-DD` label that anchors a record to its Business Day. It is the
station-local civil date on which that Business Day begins, resolved from the
station's timezone and Day Start, never directly from UTC.
_Avoid_: date, today

**Current Business Date**:
The Business Date resolved for the current instant using the Station's timezone
and Day Start. It may differ from the Station's current civil date before Day
Start, and its Business Day may be open, closed, or not yet created.
_Avoid_: today, current date

**Day Start** (`business_day_starts_at`):
The station-local time before which instants roll back to the previous
Business Date.
_Avoid_: cutoff, open time

**Shift**:
An attendant-accountability window inside a Business Day. A Business Day has
one or more Shifts; day-anchored financials need none. A Shift inherits its
Business Date from its Business Day and has no independent date.
_Avoid_: slot, rotation, session, duty

**Shift Business Date**:
The Business Date inherited from the Shift's Business Day. Use it whenever the
UI identifies which day a Shift belongs to.
_Avoid_: Shift Date, opening date, closing date

**Scheduled Shift Window**:
The Shift Template's station-local start and end times. It states the planned
operating window, not when users performed lifecycle actions in PumpOS.
_Avoid_: actual start, actual end

**Shift Opened At / Shift Closed At**:
The instants when users opened or closed the Shift in PumpOS. They are audit and
lifecycle timestamps, not the Scheduled Shift Window. Display them in the
Station's timezone.
_Avoid_: shift start, shift end, operating time

**Past Open Business Day**:
An OPEN Business Day whose Business Date precedes the Current Business Date.
This is a factual state and does not imply that staff missed a deadline.
_Avoid_: overdue day, current day

**Delayed Closure**:
Closing a Shift or Business Day after its scheduled or represented operating
period. Delayed Closure does not change the Shift Business Date; Closed At
records when the close action occurred.
_Avoid_: backdating the close

**Day Seal**:
What closing a Business Day protects: the day's sales and stock picture. A
closed Business Day rejects Shift opening/reopening, Stock Counts, Tank Dips,
Purchases, and opening-stock writes. It still accepts Late Entries on the
financial ledger.
_Avoid_: day lock, freeze

**Late Entry**:
A financial-ledger record (collection, expense, income, supplier payment,
credit sale, opening balance) written to an already-closed Business Day,
flagged as such at write time. Late Entries never move stock and never alter
the day's DSSR Snapshot.
_Avoid_: backdated entry, adjustment

**Locked Shift**:
A closed Shift whose parent Business Day has closed. It can no longer be
reopened; its Shift Summary is final. Until the day closes, a closed Shift may
be reopened by an Owner or Manager provided no other Shift is open at the
station.
_Avoid_: archived shift, frozen shift


**Backdated Business-Date Assignment**:
Recording an operation now while assigning it to an earlier Business Date. It
does not alter audit or lifecycle timestamps.
_Avoid_: backdated timestamp, backdated Shift

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
A fuel-dispensing unit ("DU") at a Station holding one or more Nozzles.
_Avoid_: pump, du (standalone)

**Attendant**:
The staff role accountable for one specific Dispenser Unit during a Shift;
assigned per shift via `shift_staff_assignments`. Generic UX copy may say
"operator" for any app user, but the shift-accountable person is always the
Attendant.
_Avoid_: operator, pumper

**Role**:
Authorization level for app users: Owner, Manager, Accountant, Staff (console),
Attendant (mobile-only, DU-scoped). `guards.ts` is the source of truth.
_Avoid_: user type, permission group

**Nozzle**:
The metered dispensing point whose readings derive all Fuel Sales.
_Avoid_: hose, gun

**Shift Template**:
A named recurring Shift window (start/end HH:MM) used to prefill Shift
opening.
_Avoid_: roster, schedule

**Payment Terminal**:
A registered card/UPI machine (TID) at a Station, optionally linked to a Shift
at open; its settlements land in its Merchant Clearing Account.
_Avoid_: POS machine, swipe machine

## Sales

**Nozzle Reading**:
A meter snapshot taken on a Nozzle at a moment in a Shift. Opening readings
default from the previous closing.
_Avoid_: meter reading, dial reading

**Sale**:
One recorded sale at a Station — the receipt-level record — typed by its lines
as `Fuel`, `Product`, `Mixed`, or `Credit`.
_Avoid_: transaction, bill, invoice (reserved for GST invoicing)

**Fuel Sale**:
A Sale whose volume derives from Nozzle Reading deltas (Closing − Opening).
Never entered by hand; never re-moves stock.
_Avoid_: pump sale, petrol sale

**Product Sale**:
A Sale of directly-entered non-fuel lines — engine oil, coolant, grease,
accessories. What earlier docs called a manual sale.
_Avoid_: manual sale, merchandise sale, lube sale

## Money Movements

**Drawer**:
The physical cash box an Attendant is accountable for during a Shift. Only cash
touches it.
_Avoid_: till, cashbox, register

**Collection**:
A customer payment settling dues — emits `CREDIT_PAYMENT_RECEIVED` and credits
the customer ledger. Cash Collections touch the Drawer; card/UPI/bank do not.
_Avoid_: receipt, payment-in

**Expense**:
Money paid out. Drawer Expenses hit the Drawer; bank/owner Expenses do not.
_Avoid_: cost, spend

**Income**:
Non-customer money-in (commissions, rent, scrap) recorded into a Financial
Account with its GST split frozen at capture.
_Avoid_: other income, misc income

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

**Handover**:
The documented pre-close handoff from an outgoing Attendant: the handed-over
cash plus meter state, recorded just before Shift close.
_Avoid_: shift change, takeover, exchange

**Cash Declaration**:
The total Drawer cash an Attendant declares at Shift close (`CASH_DECLARED`),
compared against expected drawer cash to produce the cash Variance.
_Avoid_: cash stated, declared amount

**Drawer Reconciliation**:
At shift close: `opening + cash sales + cash collections − drawer expenses −
drawer supplier payments − cash drops`. Card/UPI/bank/credit never enter it.
_Avoid_: cash count, tally

## Customers & Cards

**Customer**:
A person or organization buying fuel or products; typed `Regular`, `Credit`,
or `Fleet`.
_Avoid_: client, party, khata owner

**Fleet Customer**:
A Credit-type Customer operating Vehicles on credit terms; may settle through
an OMC Wallet or directly against receivables.
_Avoid_: corporate customer

**Vehicle**:
A registered vehicle under a Customer, linkable to credit sales.
_Avoid_: truck, car

**OMC Wallet**:
The prepaid wallet-style account held for an Oil Marketing Company: fleet and
card money is credited into it, and fuel sold on OMC cards settles against it.
Implemented as a `CMS`-type Financial Account.
_Avoid_: wallet (standalone), fuel-card account

**OMC Card Sale**:
Fuel dispensed against an Oil Marketing Company card; settles into the OMC
Wallet — never Drawer cash, never a station receivable.
_Avoid_: fuel-card sale

## Finance & Ledger

**Financial Account**:
A named money bucket ledger entries post against: `CASH_IN_HAND` (the Drawer),
`PETTY_CASH`, `BANK`, `MERCHANT_CLEARING`, `CMS` (the OMC Wallet), `OWNER`.
_Avoid_: ledger, account (standalone)

**Merchant Clearing Account**:
The Financial Account where Payment Terminal settlements accumulate before bank
credit, net of MDR.
_Avoid_: settlement account, PG account

**Ledger Entry**:
A single in/out posting against a Financial Account, typed by source (`SALE_*`,
`COLLECTION`, `EXPENSE`, `INCOME`, `SUPPLIER_PAYMENT`, …).
_Avoid_: journal entry, transaction line

## Inventory

**Stock Movement**:
The single source of truth for inventory state. All quantity changes are
movements.
_Avoid_: stock entry, inventory adjustment

**Variance**:
Expected Stock − Actual Stock, always surfaced with a reason. First-class,
never hidden inside reports.
_Avoid_: difference, delta, shortage, loss

**Tank Dip**:
A physical fuel-level measurement of a Tank converted to volume; bulk fuel
stock counts are dips.
_Avoid_: gauging, stick reading

**Physical Count**:
A counted stock-take of non-fuel items, compared against book stock.
_Avoid_: stock audit

**Tank Transfer**:
Fuel moved between two Tanks without a sale.
_Avoid_: inter-tank move, decanting

## Reports & Snapshots

**Shift Summary**:
Immutable snapshot created when a Shift closes: that shift's nozzle and drawer
reconciliation plus totals.
_Avoid_: shift report, closing report, DSSR

**DSSR Snapshot** (Daily Station Sales Report):
Immutable snapshot created when a Business Day closes: composes the day's
closed Shift Summaries plus day-anchored financials (collections, expenses,
purchases, supplier payments, credit sales). A snapshot exists if and only if
its Business Day is closed; an open day's DSSR is a preview, computed on
demand and never persisted. Financial sections are as of `generatedAt`; Late
Entries recorded afterwards do not alter the snapshot.
_Avoid_: Shift Summary, daily report, day summary

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

**Activity Group**:
The set of Business Events produced by one accepted logical command. New groups
share a correlation ID and are presented as one audit-feed row.

**Primary Event**:
The one Business Event in an Activity Group that supplies the group's
human-readable summary. It is marked `metadata.grouping.role = 'primary'`.

**Related Event**:
Another Business Event from the same logical command. It shares the Activity
Group correlation ID, is marked `metadata.grouping.role = 'related'`, and is
shown beneath the Primary Event. A Related Event is not necessarily caused by
the Primary Event.

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
