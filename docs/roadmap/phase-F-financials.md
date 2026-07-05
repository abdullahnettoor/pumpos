# Phase F — Financials (Money Accounts + P&L)

**Goal:** a real financial picture on top of the operational data — first the
**money layer** (where cash actually is: drawer, petty cash, banks, card/UPI
in-transit, owner), then the **P&L layer** (revenue − COGS − expenses). A path to
a full double-entry GL is preserved but deliberately deferred.

Two layers:
- **Layer A — Money / Accounts (FA1–FA7):** unified accounts + a single-entry
  signed ledger, posting, transfers, merchant settlement, reconciliation,
  statements. *(This is the near-term build.)*
- **Layer B — P&L / COGS (FB1–FB3):** product cost basis + management P&L.
- **Later — GL (FG1):** chart of accounts + double-entry journals.

---

## Locked design decisions (2026-07-05, user-confirmed)
1. **Unified account model** — one `financial_accounts` table for every money
   store; every transaction is ultimately an **in** or an **out** on an account.
2. **Persist a ledger** (not derive-at-read) — one `ledger_entries` table is the
   source of truth for balances. Enables transfers, opening balances, in-transit,
   reconciliation.
3. **Single-entry, signed** — `direction in|out` per entry. A **transfer** is two
   linked rows sharing a `transfer_id` (out of A, in to B) that net to zero. No
   debit/credit GL now.
4. **Opening balances** per account (`opening_balance` + `opening_date`).
5. **Month-end = a report, not a hard lock.** Continuous running ledger; generate
   an opening→movements→closing **statement** on demand. Period = **calendar
   month**; annual = **financial year Apr–Mar** (matches invoice numbering). No
   Tally-style period lock. Optional soft month-end snapshot later.
6. **Card/UPI settlement decoupled from the fuel business day via a clearing
   account.** Each payment terminal (or UPI settlement group) is a
   `MERCHANT_CLEARING` account. Sale → **in** to clearing (fuel business day);
   bank settlement (its own calendar date, usually **T+1**) → **transfer
   clearing→bank net of MDR**, with the **MDR/fee booked as an expense** (decision
   B). Clearing balance = captured-but-unsettled.
7. **Station scope now, org-shareable later** — accounts carry
   `organization_id` (required) + `station_id` (**nullable**). Shared org account
   later = `station_id` null. No rework.
8. **Reconciliation** = (a) record bank-originated entries (charges, fees,
   interest) so books match the statement — **in MVP**; (b) mark entries cleared
   against a statement — **later**.
9. **No data migration** — accounts are new tables; since there is no prod data we
   create fresh and map old `paidFrom` labels in code (`SHIFT_CASH`→Cash-in-hand,
   `BANK`→default bank account, `OWNER`→Owner). May also drop dead
   `attendant_handovers.other_card_upi`/`other_note` while here.
10. **Posting timing:** post-at-source for everything **except fuel/merch sales,
    which post at shift close** from the reconciled snapshot (their "source" is the
    close). Collections/expenses/payments/deposits/transfers post **live**.
11. **Cash-in-hand identity (decision A):** one **continuous per-station
    Cash-in-hand** account; shifts reconcile against it (truer running cash
    position) rather than cash living only inside per-shift reconciliation.

---

## Current state / gaps
- Money events live on their own tables anchored to a business day (shift only if
  drawer-touching): `collections`, `expenses` (`paidFrom` SHIFT_CASH|BANK|OWNER),
  `supplierTransactions` (same), `sales`, `customerTransactions`. Fuel cash is
  reconciled via `attendant_handovers.cashHandedOver` (fuel is never a sales row).
- Balances are **derived at read time** (`/transactions/money-movements`,
  Cash/Bank/Owner labels; L3 report computes running balance on the fly).
- **Missing:** any persisted account entity, bank accounts, petty cash, opening
  balances, card/UPI in-transit, cash-deposit-to-bank, inter-account transfers,
  reconciliation, COGS, P&L.

---

## Layer A — Money / Accounts

### Data model
```
financial_accounts
  id, organization_id, station_id?           -- nullable = org-shared (future)
  type    CASH_IN_HAND | PETTY_CASH | BANK | MERCHANT_CLEARING | OWNER
  name, opening_balance numeric, opening_date varchar(10)
  is_active, metadata jsonb                   -- BANK: {bankName, accountNoMasked, ifsc}
                                              -- MERCHANT_CLEARING: {terminalId, mdrPct, settlesToAccountId}
  created_at, updated_at

ledger_entries
  id, organization_id, station_id?
  account_id -> financial_accounts
  direction  'in' | 'out'
  amount numeric
  entry_date varchar(10)                      -- business_date (station tz)
  source_type  'SALE_CASH'|'SALE_CARD'|'COLLECTION'|'EXPENSE'|'SUPPLIER_PAYMENT'
             |'DEPOSIT'|'TRANSFER'|'SETTLEMENT'|'BANK_CHARGE'|'OPENING'|'ADJUSTMENT'
  source_id                                    -- originating row id (sale/expense/…)
  transfer_id?                                 -- links the two rows of a transfer
  business_day_id, shift_id?                   -- provenance
  reconciled boolean default false             -- Phase FA6
  notes, created_at
```
- Balance(account, asOf) = `opening_balance` + Σin − Σout (entry_date ≤ asOf).
- Append-only; corrections are reversing/`ADJUSTMENT` entries, never edits.

### Account taxonomy
- **CASH_IN_HAND** — continuous per-station till/drawer cash (decision A, #11).
- **PETTY_CASH** — office float for minor expenses; funded by transfer from
  drawer or bank (imprest-style, but a continuous ledger, not fixed top-ups).
- **BANK** — one row per bank account (multi-bank, #7).
- **MERCHANT_CLEARING** — card/UPI captured-but-unsettled per terminal (#6).
- **OWNER** — owner capital in / drawings out.

### FA1 — Accounts + ledger + opening balances
- Tables above; CRUD for accounts; opening balance seeds an `OPENING` entry.
- Reprice the existing L3 "Cash & Bank" report onto the persisted ledger.

### FA2 — Live posting (post-at-source)
Wire the outbox so recording an event also writes ledger entries:
- Collection (cash) → **in** Cash-in-hand; (bank/UPI) → **in** the chosen Bank.
- Expense / supplier payment → **out** of Cash-in-hand | Petty cash | Bank | Owner
  (from `paidFrom`/account selection).
- Owner infusion/drawing → in/out Owner ↔ Cash/Bank (transfer).

### FA3 — Shift-close posting (sales)
At shift close, from the reconciled snapshot (decision #10):
- Fuel cash + merchandise cash → **in** Cash-in-hand.
- Card/UPI → **in** the terminal's MERCHANT_CLEARING.
- Credit → receivable (already the customer ledger; no money entry).
Idempotent (keyed by shift); reconciles to the shift summary totals.

### FA4 — Transfers
Two linked entries (`transfer_id`):
- **Cash deposit** drawer → bank (daily banking).
- **Petty-cash float** drawer/bank → petty cash.
- **Bank ↔ bank / withdrawal.**

### FA5 — Merchant settlement (decision B)
On settlement (own calendar date): transfer **MERCHANT_CLEARING → Bank** for the
**net** amount; book **MDR/fee** as an `EXPENSE` (out of clearing) so gross sale −
fee = net deposited, and clearing zeroes out.

### FA6 — Statements + reconciliation
- Per-account statement (opening→movements→closing) for any period; reuse
  `LedgerView` + Phase-R PDF kit. Calendar-month default; FY Apr–Mar (#5).
- Bank charges/fees/interest as normal entries (#8a). Cleared-flag matching (#8b)
  later. Optional soft month-end snapshot.

### FA7 — UI
- Station Overview → new **Accounts** area (list/create bank + petty cash + owner;
  opening balances). Reports → per-account ledger/statement. Transfer + deposit
  + settlement quick entries.

---

## Layer B — P&L / COGS

### FB1 — Product cost basis (enables COGS)
- `products.cost_basis numeric` (rolling weighted-avg from `purchases`/
  `stock_movements`); recompute on each purchase; expose current cost per product.

### FB2 — Management P&L report
- Revenue = fuel sales value + merchandise sales. COGS = Σ qty × cost_basis. Gross
  margin. Less business+drawer expenses → net. Query over snapshots + sales + cost
  basis; period selector; PDF via Phase R.

### FB3 — Period rollups
- Daily/weekly/monthly aggregates; trends; per-product margin; per-station.

---

## Later — GL
### FG1 — Double-entry general ledger
- `chart_of_accounts`, `journal_entries` (debit/credit) posted off the existing
  transactional outbox (`events`) as an append-only, idempotent projection →
  P&L, Balance Sheet, Cash Flow. The single-entry ledger above upgrades cleanly
  into this (each signed entry maps to a journal line).

## Build order
FA1 → FA2 → FA3 → FA4 → FA5 → FA6 → FA7 → FB1 → FB2 → FB3 → (FG1 later).

## Expansion
- Budgets vs actual, cost centers, GST P&L, depreciation/fixed assets, tax-ready
  exports, bank-statement import + auto-match.
