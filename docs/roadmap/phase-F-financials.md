# Phase F — Financials / P&L / COGS

**Goal:** real management P&L from existing operational data, with a path to full double-entry later. Two tiers: F1–F3 (no GL), F4 (GL).

## What exists / gaps
- Captured: sales (fuel value derived from nozzle volume×price; merchandise as `sales` rows), expenses, purchases, supplier payments, collections, shift/DSSR snapshots.
- Missing: COGS, chart of accounts, journals, financial statements.

## F1 — Product cost basis (enables COGS)
- Schema: `products.cost_basis numeric`, optional `purchase_costs` rolling weighted-avg from `purchases`/`stock_movements`.
- Recompute on each purchase; expose current cost per product.

## F2 — Management P&L report
- Revenue = fuel sales value + merchandise sales. COGS = Σ qty × cost_basis. Gross margin. Less business+drawer expenses → net.
- Reporting query over snapshots + sales + cost basis; period selector; PDF via Phase R.

## F3 — Period rollups
- Daily/weekly/monthly aggregates; trends; per-product margin; per-station.

## F4 — Double-entry GL (later)
- `chart_of_accounts`, `journal_entries` (debit/credit). Post lines off the existing transactional outbox (`events`) as a projection → P&L, Balance Sheet, Cash Flow. Append-only, idempotent.

## Expansion
- Budgets vs actual, cost centers, GST P&L, depreciation/fixed assets, tax-ready exports.
