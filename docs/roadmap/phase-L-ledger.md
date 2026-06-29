# Phase L — Ledger / Money Visibility

**Goal:** Tally-style running-balance statements for every money entity, reusing one component. **No DB changes for L1–L4.**

## What exists
- `customer_transactions` (Credit Sale/Collection/Adjustment), `currentBalance` computed on demand.
- Customer ledger drawer + running balance in `CustomersList.tsx`; API `GET /transactions/customers/:id/ledger`.
- Supplier ledger API `GET /transactions/suppliers/:id/ledger` (no UI).
- Primitives: `DataTable`, `Drawer`, `KpiCard`.

## L1 — Generic `<LedgerView>`
- Extract from CustomersList: props `entity`, `entries[]`, `openingBalance`, `columns`, debit/credit rule, balance card. Reuse DataTable/Drawer.
- On-demand running balance (audit-safe; nothing stored).

## L2 — Supplier ledger UI
- Wire to existing `/suppliers/:id/ledger`; payables balance, purchase vs payment, paidFrom.

## L3 — Cash & Bank ledgers (virtual)
- Aggregate collections/expenses/supplier payments by `paidFrom`/`affectsDrawer`; unified statement. No new tables.

## L4 — Expense register
- Category-grouped expense view + KPIs.

## L5 — PDF statements
- Reuse Phase R: `buildCustomerStatementDoc` etc. → download via existing saver.

## Expansion
- Aging buckets, reminders, interest on overdue, multi-currency, dedicated `bank_accounts`/`cash_accounts` with reconciliation, statement email/WhatsApp.
