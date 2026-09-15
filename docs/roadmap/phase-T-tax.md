# Phase T — Product Tax Restructure & GST Invoicing

**Status:** T1–T5 done. Tax-split columns live in `0000_baseline` (**re-apply the baseline / reset the DB before use**). **Depends on:** R (PDF kit), L (ledger) helpful but not required.

**Goal:** Model Indian fuel-retail taxation correctly and enable **B2B GST tax invoices** with CGST/SGST/IGST line splits, while keeping fuel (VAT, outside GST) distinct from merchandise/lubes (GST).

## Domain facts (confirmed)

- **Petrol, diesel, ATF, crude, natural gas are OUTSIDE GST** → state **VAT** only (no input tax credit for the buyer).
- **Lubricants, additives, merchandise → GST.** Intra-state = **CGST + SGST** (split 50/50); inter-state = **IGST**. Post-Sep-2025 slabs: 0 / 5 / 18 / 40 (lubes/most merch = 18).
- CGST/SGST vs IGST is decided at **document time** by buyer-state vs station-state (place of supply) — never stored on the product.

## T1 — Product tax model ✅ done

- Added `tax_category` enum column (`FUEL_VAT | GST | EXEMPT | NON_TAXABLE`); `is_taxable` kept as derived
  legacy flag (= category===GST). `tax_config` JSONB gained `vat_rate` + `cess`. Migration 0012 applied (9 FUEL_VAT / 8 GST).
- Threaded through shared types, core command/use-cases/validator/ports, product repo adapter.
- ProductsCatalog UI: Tax Category select + conditional VAT% / GST% + HSN/SAC. Quick-add fuel → FUEL_VAT.

## T2 — Place of supply + buyer tax identity ✅ done

- Customer (and supplier) `metadata.stateCode` added (UI field + schema + payload). Station supplier state is
  `settings.legal.stateCode` (R1). Intra vs inter-state derived at computation time.

## T3 — Tax computation service (`@pump/core`) ✅ done

- Pure `computeTax(lines, { supplierStateCode, buyerStateCode })` + `computeLineTax` / `isInterState` in
  `capabilities/finance/tax`. GST → CGST+SGST intra / IGST inter; FUEL_VAT → VAT; EXEMPT/NON_TAXABLE → 0; cess supported.
  6 unit tests. Exported from core.

## T1 — Product tax model (orig spec)

- Replace product `is_taxable` boolean with **`taxCategory` enum**: `FUEL_VAT | GST | EXEMPT | NON_TAXABLE` (explicit column, queried).
- Keep/extend `tax_config` JSONB: `{ hsnOrSac, gstRatePct, vatRatePct, cessPct }` (rarely queried → JSONB, per metadata rule).
- Defaults: fuel products → `FUEL_VAT`; lubricants/accessories → `GST` @ 18.
- Migration + onboarding/product-edit UI (category select + rate fields). No backfill needed (no prod data).

## T2 — Place of supply + buyer tax identity

- Customer: add `stateCode` alongside existing `metadata.gstin` (B2B buyer identity).
- Station: `settings.legal.stateCode` (from R1) is the supplier state.
- Derive intra vs inter-state at invoice build time.

## T3 — Tax computation service (`@pump/core`)

- Pure function: line items + buyer state + station state → per-line `{ taxable, cgst, sgst, igst, cess, total }` + document totals.
- Used by both on-screen tax preview and invoice generation.

## T4 — GST tax invoice generation

- Invoice **numbering**: reintroduce a gapless **per-FY-per-GSTIN** series (e.g. `INV/2026-27/00001`). NOTE: `document_sequences` was dropped in tech-debt — reintroduce a small numbering store for this.
- Invoice PDF via the Phase-R react-pdf kit: letterhead (R1) + line splits + HSN/SAC + tax summary + amount in words.
- Scope: B2B merchandise/lube sales first; fuel VAT invoice later.
- **Part 1 (backend) ✅ done + deployed** — migration 0014 (`invoices` immutable snapshot + `invoice_sequences`
  gapless store). Core `GenerateInvoice` use-case (idempotent per sale; reuses `computeTax`; assigns
  `INV/{FY}/{00001}` via `InvoiceSequenceRepository.nextNumber` atomic upsert; invoice-level round-off; emits
  `INVOICE_GENERATED`) + `InvoiceRepository`/`InvoiceSequenceRepository` ports + `financialYear()` helper. Drizzle
  adapters. Routes: `POST /transactions/sales/:id/invoice` (issue, Owner/Manager/Accountant), `GET
/transactions/invoices`, `GET /transactions/invoices/:id`, `GET /transactions/sales/:id/invoice`.
- **Part 2 (PDF + UI) ✅ done + deployed**: `services/reports/invoiceDoc.tsx` (`InvoiceDoc`) reuses the Phase-R
  react-pdf kit (letterhead band, generic table) — line items + CGST/SGST-or-IGST summary + round-off + **amount
  in words** (Indian numbering), supplier identity read from the snapshot. Backend `GET /transactions/sales`
  (non-fuel sales with invoice status). Reports **Invoices** tab (`InvoicesPanel`): date range, KPIs
  (sales / invoiced / pending), per-row **Issue** (idempotent) → downloads PDF, or **PDF** re-download for issued
  ones; Staff can't issue. `useSales`/`useInvoices` hooks + `issueInvoice`/`getInvoices`/`getSales` service.

## T5 — Output tax on sales ✅ done (migration pending apply)

**Goal:** a complete **daily output-tax picture** on the DSSR — output VAT (fuel) +
output GST (merchandise) + output GST (other income) — so a return can be filed
from the report instead of reverse-engineered from invoices.

### What shipped

- **Schema** — `sale_items` gained `tax_category`, `gst_rate`, `vat_rate`,
  `cess_rate`, `hsn_code`, `taxable_amount`, `cgst`, `sgst`, `igst`, `vat`, `cess`
  (and `other_income` the FI4 equivalents). Since the platform is still
  pre-production, these were **consolidated into `0000_baseline.sql`** rather than
  shipped as an incremental `0002` — one baseline, no migration chain to babysit.
  Once a production database exists, this consolidation is no longer allowed:
  new columns must then arrive as an additive, idempotent migration.
- **Core** `capabilities/retail/sale-tax.ts` → `splitSaleLineTax(gross, product, interState)`.
  It **extracts** tax from the line's gross by default (`price_inclusive` defaults
  true — pump rate includes VAT, MRP includes GST), so **a line total is never
  changed by the split**. No rate ⇒ zero split with the full gross as taxable.
  Wired into `CreateSale` (buyer state from `customer.metadata.stateCode`,
  supplier state from `stations.settings.legal.stateCode`) and
  `RecordMerchandiseHandover`. `sales.subtotal_amount` / `sales.tax_amount` are
  deliberately **unchanged** — only the new per-line columns are populated.
- **API** `GET /api/transactions/sales/tax-register` (excludes `NON_TAXABLE`,
  optional `taxCategory` filter).
- **DSSR** `salesTax: { gst: {taxable,cgst,sgst,igst,cess,total}, vat: {taxable,vat} }`,
  rendered in `DailyDssrView` and the PDF (`dssrDoc.tsx`).
- **UI** Reports → **Tax Register** tab (`reports/TaxRegisterPanel.tsx`): GST on
  merchandise and VAT on fuel in two separate panels, plus the FI4 GST-on-income
  totals — GST and VAT are **never summed together**.

### The gap it closed

Sales carry **no tax split**: `sale_items` stores only a lumped `tax_amount`. The
CGST/SGST/IGST breakdown is computed at **invoice time** (T4) and frozen on the
`invoices` snapshot. So an uninvoiced walk-in merchandise sale has no recoverable
split, and fuel sales have no VAT figure computed anywhere.

Meanwhile **FI4 is done** (`phase-F-financials.md`): every income entry freezes its
own GST split at capture and the DSSR already carries `income.tax`
(`taxable / cgst / sgst / igst / cess / total / entries`). T5 is the sales-side
equivalent — the composition slot in `compose.ts` already exists to copy.

### Design decision — freeze at capture, don't recompute in the report

Split the tax on **`sale_items` at capture** — using the **exact column shape
already established by `purchase_items`** (and now mirrored on `other_income`):
`tax_category`, `gst_rate`, `vat_rate`, `cess_rate`, `hsn_code`, `taxable_amount`,
`cgst`, `sgst`, `igst`, `vat`, `cess` — rather than deriving it in the DSSR from
the product's _current_ `tax_config`.

**Columns, not a JSONB blob**, because these values are _aggregated and grouped_:
registers and the DSSR `SUM()` the money components, and GST returns are
fundamentally **rate-wise** (GSTR-1) with an **HSN summary** section. JSONB would
force a cast on every row, forfeit `numeric(12,2)` exactness and `NOT NULL`
defaults, and need expression indexes to group by rate. Reserve JSONB for the
residual evidence nobody filters on.

Rationale — the same rule that governs shift summaries and DSSR: **re-rating a
product must never rewrite last month's tax**. A GST slab change or an MRP toggle
would silently restate closed periods if the report recomputed on the fly. It also
makes every sale return-ready whether or not an invoice was ever issued, and keeps
invoiced and uninvoiced sales consistent (T4's invoice snapshot then simply agrees
with the line splits instead of being the only source of them).

### Build order

1. **Schema** — tax split columns on `sale_items`. Rows default to `NON_TAXABLE`
   with zeros, so anything captured before the split is never back-computed.
2. **Core** — freeze the split in the sale use-case via the existing `computeLineTax`
   (honouring `price_inclusive` / MRP), exactly as `computeIncomeTax` does for income.
   Fuel lines resolve to `FUEL_VAT` → `vat`, merchandise to `GST` → CGST/SGST or IGST.
3. **DSSR** — extend the sales ports with the split, aggregate into `sales.tax`
   alongside the existing `income.tax`, and render **Output VAT** / **Output GST**
   lines in `DailyDssrView` + `dssrDoc.tsx`. Add a compose test.
4. **Register** — a sales GST/VAT register endpoint + tab, mirroring the purchase
   ITC register and the FI4 GST-on-income register, so all three sit side by side.

### Deferred

- **Per-shift** output-tax breakup on `shift_summaries` — the day-level DSSR figure
  covers filing; the per-shift split is only an operator-attribution nicety.

### Note on fuel

Fuel VAT is an **output tax with no input credit for the buyer** — report it, but
keep it in a separate line from GST and never fold the two totals together.

## Tax-inclusive (MRP) pricing ✅ done + deployed

- Retail merchandise/lubes are priced MRP (tax-inclusive) — tax is extracted, not added. `computeLineTax` gained
  an `inclusive` flag (back-calculates the taxable base from the gross). Products carry `taxConfig.price_inclusive`
  (default true for GST; ProductsCatalog checkbox). GST invoice generation honours it (line rate shown pre-tax so
  Rate×Qty=Taxable). MerchandiseSaleEntryForm shows a live Taxable / GST / Total breakdown.
- Reality confirmed by research: B2B/registered or on-request ⇒ tax invoice; B2C walk-in small value ⇒ optional
  consolidated day-end invoice; fuel ⇒ VAT, bulk from readings, no GST invoice.

## Open questions

- Rounding rules (per-line vs invoice-level), reverse charge (RCM) — defer.
- E-invoice (IRN/QR) for turnover thresholds — future.
