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
- **Done ✅** — backend `GET /transactions/money-movements?stationId=&from=&to=` (3 Promise.all queries → merge):
  collections IN, expenses OUT, supplier payments OUT, classified **Cash** (paymentMethod Cash / paidFrom
  SHIFT_CASH) vs **Bank** (Card/UPI/BankTransfer / paidFrom BANK); OWNER + fuel/drawer sales EXCLUDED so it never
  double-counts the DSSR. Frontend `reports/CashBankLedger.tsx` — Reports **Cash & Bank** tab: Cash/Bank
  `Segmented`, date range, In/Out/Net `KpiCard`s, movements table with period-relative running balance. Deployed.
  (Opening balances / `bank_accounts` = L-expansion.)

## L4 — Expense register
- Category-grouped expense view + KPIs.
- **Done ✅** — `reports/ExpenseRegister.tsx` as a **Reports tab** (Daily DSSR | Expense Register). Business-date
  range filter (defaults to current business month via `resolveBusinessDate`), KPI strip (total / entries /
  categories / largest category), category breakdown with % bars, and a full `DataTable` (date, category,
  description, paid-from, amount). Client-side over cached `useExpenses` (VOIDED excluded); no backend. Reports
  is now the extensible hub for L/F/X report tabs.

## L5 — PDF statements
- Reuse Phase R: `buildCustomerStatementDoc` etc. → download via existing saver.

## L6 — Entity-aware unified Ledger ✅ done (deployed)
- Reports **Ledger** tab: pick a ledger **type** (`Segmented`: Customer | Supplier | Cash | Bank | Owner) →
  entity `Combobox` (only for Customer/Supplier) → period → **View Ledger** button. **Submit-to-fetch**: the
  data query only fires on the button (draft form changes never hit the backend).
- `reports/UnifiedLedger.tsx` is **registry-driven** — `REGISTRY[type]` supplies `resolve()`, debit/credit rule,
  KPI labels, balance meaning & tone, caption. Adding a future entity (employee, fleet, GST, specific bank
  account) = **one registry entry**, zero redesign.
- Reuses the generic `<LedgerView>` (running balance, debit raises) + `useCustomerLedger`/`useSupplierLedger`
  (party ledgers, clamped client-side to the period) and `useMoneyMovements` (Cash/Bank/Owner, filtered by account).
- Backend: `money-movements` now also classifies **Owner** (`paidFrom OWNER`), so the Owner ledger finally has a
  home. Cash & Bank tab still filters to Cash/Bank so it's unaffected. Deployed.
- KPIs per type: Customer (Credit Sales / Collections / Receivable), Supplier (Purchases / Payments / Payable),
  Cash & Bank (Received / Paid Out / Balance), Owner (Owner Funded / Repaid-Drawn / Owner Funding). Balances are
  period-relative (opening balances = expansion).

## Expansion
- Aging buckets, reminders, interest on overdue, multi-currency, dedicated `bank_accounts`/`cash_accounts` with reconciliation, statement email/WhatsApp.
