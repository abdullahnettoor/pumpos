# Report proposals (A + B)

PDF mock-ups of new and upgraded reports, for team review **before** any of them is built. Each
PDF shows every column, total and filter the report would have, on realistic sample data for one
fictional station (Sree Lakshmi Fuels, Kochi, Oct 2026). Nothing here is wired to the API.

- **Group A** — every figure can be built from data PumpOS already stores.
- **Group A+B** — a few figures wait on a small group-B addition. Those columns and filters carry
  a `*`, and each PDF's _Data source & notes_ block says what they need.

Start with [`00-overview.pdf`](pdf/00-overview.pdf).

## Index

Templates live in `packages/ui/src/services/reports/proposals/` (`<name>Doc.tsx` + `samples/<name>Sample.ts`).
Each template takes typed props (`data` + `ctx`) mirroring what the real report needs, so it can be
ported into the real export as-is.

| #   | Report                                                                      | Template                   | Data source                                                          | Open questions                                                        |
| --- | --------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 00  | [Overview](pdf/00-overview.pdf)                                             | `overviewDoc.tsx`          | —                                                                    | —                                                                     |
| 01  | [Product-wise Sales](pdf/01-product-wise-sales.pdf)                         | `productSalesDoc.tsx`      | Nozzle readings (Shift Summaries / DSRs), `sale_items`               | Category list values                                                  |
| 02  | [Product-wise Purchases](pdf/02-product-wise-purchases.pdf)                 | `productPurchaseDoc.tsx`   | Fuel Purchases (entry date), product Purchases (business day)        | Show invoiced vs decanted litres?                                     |
| 03  | [Stock Report](pdf/03-stock-statement.pdf)                                  | `stockStatementDoc.tsx`    | `stock_movements`, current cost price                                | Fuel valued incl. VAT, lubes ex-GST?                                  |
| 04  | [Tank Stock & Variation](pdf/04-tank-stock-variation.pdf)                   | `tankVariationDoc.tsx`     | DSR tank figures + Tank Dips                                         | Opening = previous dip? Sign dip − book vs GLOSSARY expected − actual |
| 05  | [Cash Book](pdf/05-cash-book.pdf)                                           | `cashBookDoc.tsx`          | Cash in Hand ledger entries by entry date                            | Shift-close receipt = counted + drops − floats?                       |
| 06  | [Shift Cash Variance](pdf/06-shift-cash-variance.pdf)                       | `shiftCashVarianceDoc.tsx` | Handover drawer reconciliation + shift close count                   | Is office count variance posted?                                      |
| 07  | [Attendant Cash Variance (Shortage)](pdf/07-attendant-cash-variance.pdf)    | `attendantVarianceDoc.tsx` | Handover drawer reconciliation (view-only)                           | Reason / approval / recovery fields (future)                          |
| 08  | [POS Collection & Reconciliation](pdf/08-pos-collection-reconciliation.pdf) | `posReconciliationDoc.tsx` | Shift payment split, terminal declarations, Merchant Clearing → Bank | Batch-level settlement matching (future)                              |
| 09  | [Sundry Debtors with Ageing](pdf/09-sundry-debtors-ageing.pdf)              | `debtorsAgeingDoc.tsx`     | `customer_transactions`, FIFO settlement                             | 30-day buckets vs the app's 0–7 / 8–30 / 30+                          |
| 10  | [Sundry Creditors with Ageing](pdf/10-sundry-creditors-ageing.pdf)          | `creditorsAgeingDoc.tsx`   | `supplier_transactions`, FIFO settlement                             | Credit days per supplier                                              |
| 11  | [Ledger Report](pdf/11-ledger.pdf)                                          | `ledgerReportDoc.tsx`      | Ledger entries, party ledgers, expense records                       | Expense-head running total from 01 Apr?                               |
| 12  | [Expense Report](pdf/12-expense.pdf)                                        | `expenseReportDoc.tsx`     | Expenses (entry date)                                                | Payee field vs description                                            |
| 13  | [Income Report](pdf/13-income.pdf)                                          | `incomeReportDoc.tsx`      | Income (entry date, frozen GST split)                                | Payer GSTIN for B2B income?                                           |
| 14  | [GSTR-1](pdf/14-gstr-1.pdf)                                                 | `gstr1Doc.tsx`             | GST sales (lubes/merch) + taxable income; fuel excluded              | Credit/debit notes, portal JSON later                                 |
| 15  | [GSTR-3B](pdf/15-gstr-3b.pdf)                                               | `gstr3bDoc.tsx`            | GSTR-1 totals, product Purchase GST (ITC); fuel as non-GST           | Interest exempt in 3.1(c)? GST on expenses as ITC?                    |
| 16  | [Profit & Loss](pdf/16-profit-and-loss.pdf)                                 | `profitLossDoc.tsx`        | Sealed DSRs (margin method COGS), income, expenses                   | Fuel revenue/cost incl. or ex-VAT?                                    |
| 17  | [Day Book](pdf/17-day-book.pdf)                                             | `dayBookDoc.tsx`           | Sales by business date + office records by entry date                | Debit/Credit convention; name vs "Daily Cash Book"                    |

## Group-B additions

| Addition                         | Unlocks    |
| -------------------------------- | ---------- |
| Direct / Indirect flag on heads  | 12, 13, 16 |
| Product category + reorder level | 01, 02, 03 |
| Voucher numbers                  | 05, 11, 17 |
| Denomination count               | 06         |
| Per-station tank variance limit  | 04         |
| Credit days                      | 09, 10     |

## Regenerate

```sh
npm run report-proposals -w @pump/ui            # all PDFs
npm run report-proposals -w @pump/ui -- 01 06   # only these
```

The script (`packages/ui/scripts/render-report-proposals.mjs`) loads the TSX templates through
Vite's module runner and writes `docs/report-proposals/pdf/<nn>-<slug>.pdf`. Sample data comes from
a seeded generator and dates are fixed, so the printed content is the same on every run.
