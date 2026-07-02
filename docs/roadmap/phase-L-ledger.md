# Phase L — Ledger / Money Visibility

**Goal:** Tally-style running-balance statements for every money entity, reusing one component. **No DB changes for L1–L4.**

## What exists
- `customer_transactions` (Credit Sale/Collection/Adjustment), `currentBalance` computed on demand.
- Customer ledger drawer + running balance in `CustomersList.tsx`; API `GET /transactions/customers/:id/ledger`.
- Supplier ledger API `GET /transactions/suppliers/:id/ledger` (no UI).
- Primitives: `DataTable`, `Drawer`, `KpiCard`.

## L1 — Generic `<LedgerView>` ✅ done
- `packages/ui/src/components/ledger/LedgerView.tsx`: props `entries`, `resolve(tx)→{date,label,type,amount,direction}`,
  `openingBalance`, amount/balance labels, loading/error/empty. On-demand running balance (debit raises, credit lowers),
  newest-first. Exported from `@pump/ui`.

## L2 — Customer + Supplier ledgers ✅ done (on LedgerView)
- CustomersList + PurchasesList inline ledger tables replaced with `<LedgerView>` (customer: Credit Sale/Adjustment/
  Top-up = debit, Collection/Charge = credit; supplier: Purchase/Adjustment = debit, Payment = credit). Balance cards unchanged.

## L1 — Generic `<LedgerView>` (orig spec)
- Extract from CustomersList: props `entity`, `entries[]`, `openingBalance`, `columns`, debit/credit rule, balance card. Reuse DataTable/Drawer.
- On-demand running balance (audit-safe; nothing stored).

## L2 — Supplier ledger UI
- Wire to existing `/suppliers/:id/ledger`; payables balance, purchase vs payment, paidFrom.

## L3 — Cash & Bank ledgers (virtual)
- Aggregate collections/expenses/supplier payments by `paidFrom`/`affectsDrawer`; unified statement. No new tables.

## L4 — Expense register
- Category-grouped expense view + KPIs.
- **Done ✅** — `reports/ExpenseRegister.tsx` as a **Reports tab** (Daily DSSR | Expense Register). Business-date
  range filter (defaults to current business month via `resolveBusinessDate`), KPI strip (total / entries /
  categories / largest category), category breakdown with % bars, and a full `DataTable` (date, category,
  description, paid-from, amount). Client-side over cached `useExpenses` (VOIDED excluded); no backend. Reports
  is now the extensible hub for L/F/X report tabs.

## L5 — PDF statements
- Reuse Phase R: `buildCustomerStatementDoc` etc. → download via existing saver.

## Expansion
- Aging buckets, reminders, interest on overdue, multi-currency, dedicated `bank_accounts`/`cash_accounts` with reconciliation, statement email/WhatsApp.
