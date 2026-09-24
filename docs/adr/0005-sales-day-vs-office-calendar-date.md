# Shifts and sales anchor to the Business Day; office money anchors to the calendar date

Status: accepted (2026-09-23). Supersedes the "universal anchor" rule in
`AGENTS.md` and the financial-ledger half of ADR 0003.

## Context

The Business Day was the universal anchor: every record, including office
finance, resolved its date with the station's Day Start. So a bank expense paid
at 03:00 on the 15th (Day Start 06:00) landed on the 14th, which is not the
date an accountant expects. The drawer formula also counted collections,
drawer expenses and drawer supplier payments. Attendants don't handle any of
those at the station; the office does.

## Decision

A station has two separate worlds:

1. **Forecourt (Business Day + Shift).** The Business Day is the station's
   sales day. It starts at the Day Start chosen at onboarding (any time, not a
   fixed 06:00) and runs 24 hours. It holds Shifts and **all Sales** (Fuel,
   Product, Credit), including the card/UPI method of a Sale. Closing it
   produces the DSSR, which becomes a **sales-only** report composed of the
   day's Shift Summaries.
2. **Office (calendar date).** Collections (any method, even at a pump
   terminal), Supplier Payments, Expenses, Income and bank work carry a
   **station-timezone calendar date** (midnight to midnight), with no Shift and
   no Business Day. They live in the ledger. The test is "is this paying for
   fuel or products right now?", not "which machine was used?"

Consequences:

- Drawer Reconciliation simplifies to
  `expected = opening + cash sales − cash drops`. Drawer Expenses and Drawer
  Supplier Payments stop existing. If the office takes cash from a drawer, that
  is a Cash Drop, and the office records the spend in its own books.
- **Cash in Hand** (`CASH_IN_HAND`) is the office cash account. It receives
  shift-close cash postings and cash Collections, and pays cash Expenses and
  Supplier Payments.
- Office records stay editable with an audit trail. A "close the books" lock
  (per day or month) is future work. Late Entry as a concept no longer applies
  to office records.
- A **Daily Cash Book**, computed live from the ledger, shows each account's
  opening, in, out and closing per calendar date. Only forecourt reports
  (Shift Summary, DSSR) are immutable snapshots.
- A Day Start change takes effect from the next Business Day; existing days
  keep their window.
- Forward-only: there are no production records, so nothing is migrated.
- Changing the start time never changes an office record's date, because that
  date is the plain calendar date in the station's timezone.

## Considered options

- **Status quo (one anchor).** Simple, but office dates disagree with the
  calendar and the drawer mixes in office cash.
- **Split, with drawer cash following the shift.** Rejected: attendants don't
  take collections or pay expenses, so no office cash enters a drawer.
- **Pure calendar for everything.** Rejected: a shift that crosses midnight
  would span two dates.

## Clarifications (2026-09-23 grilling)

- **Purchases stay forecourt stock events** anchored to the Business Day, and
  the Day Seal still covers them. The DSSR keeps purchase and stock lines.
  Paying the supplier is a separate Supplier Payment (an Office Record).
- **Funding Account replaces `paid_from` / `received_into`.** An Office Record
  names the Financial Account the money moved through (Cash in Hand, Petty
  Cash, a specific bank, Owner…). Its method filters the accounts offered.
  `SHIFT_CASH` is removed.
- **Entry Date** defaults to today in the station timezone. The user may pick
  any past date but never a future one. There is no window until a books-close
  lock exists.
- **Shift-close cash** posts to Cash in Hand on the station-timezone calendar
  date of the close instant, not the Shift Business Date. With Delayed Closure
  that is the date the cash actually reached the office.

- **The Drawer is per Attendant.** Each Attendant/DU gets an Opening Float
  (0 allowed) at Shift open and is reconciled at Handover as
  `float + DU cash sales − that Drawer's Cash Drops`. The Shift figure is the
  sum. Rejected: one shift-wide float nobody owns, which is how the code
  worked before and does not match stations where each DSM carries a pouch.

- **Collections leave the customer ledger.** A Collection is read straight
  from `collections` (balance = Σ credit sales − Σ collections); no mirror row
  is written to the Business-Day-anchored customer ledger.
- **Payment Terminal on an office receipt** (#276) routes the money to that
  terminal's clearing account, else the station's generic Merchant Clearing,
  and is kept on the ledger row.

## Open / deferred

- **Purchases on a calendar date.** Revisit only if accountants need invoice
  dates separate from the stock receipt day.
- **Editing an Entry Date / voiding a collection.** Office Records are voided
  (expenses, income) or not correctable at all (collections, supplier
  payments) today. How a correction re-posts the ledger is undecided.
- **Bank value date** (statement date, for bank reconciliation) is a third
  date axis. It goes in a separate future ADR.
