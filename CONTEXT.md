# PumpOS

The shared language for PumpOS, a multi-tenant fuel-station management platform
for Indian fuel retail. This is the glossary; hard rules live in `AGENTS.md`.
When writing issues, specs, tests, or code names, use these terms exactly.

## Time & Anchoring

**Business Day**:
One station's sales day, keyed by `(station, Business Date)`. It starts at the
station's Day Start (any time chosen at onboarding) and runs 24 hours. It holds
Shifts and Sales only; Office Records do not belong to it (ADR 0005). Several
may be open at once; a past day closes independently without blocking the
Current Business Date.
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
Business Date. A change takes effect from the next Business Day.
_Avoid_: cutoff, open time

**Entry Date**:
The station-timezone calendar date (midnight to midnight) of an Office Record.
Day Start never applies to it. Defaults to today; may be any past date, never a
future one.
_Avoid_: Business Date (for office records), UTC date

**Office Record**:
Money handled by the office, not by Attendants: Collections, Supplier
Payments, Expenses, Income and bank work. Carries an Entry Date, no Shift and
no Business Day, and lives in the ledger.
_Avoid_: day-anchored financial, back-office entry

**Shift**:
An attendant-accountability window inside a Business Day, covering the Sales
at the Attendant's Dispenser Unit. A Business Day has one or more Shifts;
Office Records never belong to one. A Shift inherits its
Business Date from its Business Day and has no independent date.
_Avoid_: slot, rotation, session, duty

**Shift Business Date**:
The Business Date inherited from the Shift's Business Day. Use it whenever the
UI identifies which day a Shift belongs to.
_Avoid_: Shift Date, opening date, closing date

**Shift Label**:
How a Shift is named to a human: `YYYYMMDD-N` — its Shift Business Date, then
its position within that Business Day (`20260917-2`). Derived at read time,
never an identifier and never a column; the UUID stays the only identifier.
Report snapshots freeze it alongside the figures they freeze. The position
counts every Shift the day ever had, voided ones included, so a Label printed
yesterday names the same Shift tomorrow. Numbering resets each Business Day.
_Avoid_: shift number, shift code, shift ID (the UUID)

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
Purchases, and opening-stock writes. Office Records are unaffected: they carry
an Entry Date, not a Business Day.
_Avoid_: day lock, freeze

**Late Entry**:
Retired for Office Records by ADR 0005: they no longer attach to a Business
Day, so there is no closed day to be late against. Office Records stay
editable with an audit trail until a future books-close lock exists.
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
Forecourt records (Shifts, all Sales including Credit Sales, Cash Drops)
anchor to a Business Day, and Sales and Cash Drops to a Shift. Office Records
anchor only to an Entry Date (ADR 0005).
_Avoid_: linking office money to a shift or Business Day

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

**Product Capability**:
A coarse, customer-visible area of PumpOS that can be granted independently,
such as advanced inventory or multi-station reporting. Product Capabilities are
named for business value, not individual screens, buttons, or implementation
details.
_Avoid_: feature, module, screen flag

**Entitlement**:
An Organization's grant to use a Product Capability. It controls whether the
Organization has access; a Role separately controls what a user may do within
that access. Revoking an Entitlement prevents new actions but does not hide the
Organization's historical records.
_Avoid_: permission, role, feature flag

**Feature Flag**:
A temporary control used by PumpOS to stage software rollout or disable faulty
behavior. It is not customer access, authorization, or commercial packaging.
_Avoid_: entitlement, permission

**Product Plan**:
The commercial package assigned to an Organization. A Product Plan supplies a
set of Product Capabilities and Limits; an Organization may also receive
additional Entitlements without changing its Product Plan.
_Avoid_: role, subscription status

**Limit**:
A numeric allowance attached to an Organization through its Product Plan, such
as the maximum number of Stations. A Limit constrains use of an available
Product Capability; it is not a boolean Entitlement.
_Avoid_: feature flag, permission, quota flag

**Subscription Status**:
The Organization's commercial access state: Trialing, Active, Past Due,
Restricted, Canceled, or Suspended. It applies to the Organization as a whole
and is separate from any user's login status or Role.
_Avoid_: owner status, user status, entitlement

**Payment Grace Period**:
The seven-day period after a subscription payment fails. The Organization is
Past Due but retains normal access while Owners and Managers receive payment
warnings.
_Avoid_: trial, extension

**Restricted Access**:
The access mode after the Payment Grace Period ends. Existing Stations retain
the essential actions needed to finish station operations safely, while growth,
setup changes, and premium actions are blocked.
_Avoid_: read-only mode, deactivated Organization

**Suspended Organization**:
An Organization manually stopped by PumpOS for a security, legal, fraud, or
abuse concern. Suspension blocks new writes and is separate from payment-based
Restricted Access. Historical access may remain available to Owners and
Managers.
_Avoid_: Past Due Organization, Restricted Access

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

**Billed Sale**:
A Product Sale captured individually at the counter (`captureMechanism =
'POS'`), optionally carrying a GST invoice. Distinct from a Handover Product
Sale.
_Avoid_: invoiced sale, POS sale, quick sale

**Handover Product Sale**:
The single bulk Product Sale an Attendant declares at Shift close
(`captureMechanism = 'MERCH_HANDOVER'`) covering non-fuel items sold during
the Shift that were not individually billed. One per Shift per Attendant.
_Avoid_: merchandise handover, bulk sale

## Money Movements

**Drawer**:
The cash an Attendant is accountable for at their Dispenser Unit during a
Shift (in practice, their pouch). One per Attendant per DU per Shift, never
shared. Only cash touches it.
_Avoid_: till, cashbox, register

**Collection**:
A customer payment settling dues — emits `CREDIT_PAYMENT_RECEIVED` and credits
the customer ledger. An Office Record in any method; never touches the Drawer,
even when paid at a pump terminal.
_Avoid_: receipt, payment-in

**Expense**:
Money paid out. An Office Record; cash Expenses come from Cash in Hand, never
the Drawer.
_Avoid_: cost, spend

**Income**:
Non-customer money-in (commissions, rent, scrap) recorded into a Financial
Account with its GST split frozen at capture.
_Avoid_: other income, misc income

**Supplier Payment**:
Money paid to a supplier. An Office Record; never touches the Drawer.
_Avoid_: vendor payment, purchase payment

**Purchase**:
Stock received from a supplier. A forecourt stock event anchored to the
Business Day (sealed with it), never to a Shift. Paying for it is a separate
Supplier Payment.
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
Cash taken from one Attendant's Drawer mid-shift (e.g., to a safe), reducing
that Drawer's expected cash. Recorded on that Attendant's Handover. Rare.
_Avoid_: safe drop, remittance

**Handover**:
The documented pre-close handoff from an outgoing Attendant: the handed-over
cash plus meter state, recorded just before Shift close.
_Avoid_: shift change, takeover, exchange

**Opening Float**:
Change money issued to one Attendant for their Drawer at Shift open; zero is
allowed. The Shift's opening cash is the sum of its Opening Floats.
_Avoid_: opening cash (per shift), change fund

**Cash Declaration**:
The total Drawer cash an Attendant declares at Shift close (`CASH_DECLARED`),
compared against expected drawer cash to produce the cash Variance.
_Avoid_: cash stated, declared amount

**Drawer Reconciliation**:
Per Drawer, at Handover: `Opening Float + DU cash sales − Cash Drops`,
compared with the cash handed over. The Shift's figure is the sum of its
Drawers. Office money, card/UPI and credit never enter it. Cash the office takes from a Drawer is a
Cash Drop.
_Avoid_: cash count, tally

**Cash in Hand**:
The station's main office cash account (`CASH_IN_HAND`). Receives shift-close
cash (on the calendar date of the close) and cash Collections; pays cash
Expenses and Supplier Payments.
_Avoid_: office drawer

**Petty Cash**:
A small second office cash float (`PETTY_CASH`), topped up from Cash in Hand
by transfer, for minor spends.
_Avoid_: Cash in Hand, float

**Funding Account**:
The Financial Account an Office Record's money moved through, chosen by the
user and filtered by method. Replaces the old "paid from" sources.
_Avoid_: paid from, received into, source

**Daily Cash Book**:
A live ledger view per Entry Date and account: opening, in, out, closing. Not
a snapshot.
_Avoid_: day book, cash report

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
Immutable snapshot created when a Business Day closes: a sales-only report
composing the day's closed Shift Summaries (fuel, product and credit sales,
their card/UPI split, stock). Office Records are not in it; see Daily Cash
Book (ADR 0005). A snapshot exists if and only if its Business Day is closed;
an open day's DSSR is a preview, computed on demand and never persisted.
_Avoid_: Shift Summary, daily report, day summary

**Attendant Handover Report**:
A read-only, date-range report composing one Attendant's Handovers across
closed Shifts: fuel sales, Billed Sales, Handover Product Sales, Credit Sales,
Payment Terminal declarations, DU/Nozzle attribution, and per-Shift plus net
Variance. Gated on the `reports.attendant` Product Capability; exports as a
per-attendant PDF statement with a sign-off block.
_Avoid_: attendant report, staff report, variance report

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
