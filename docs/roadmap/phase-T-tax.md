# Phase T — Product Tax Restructure & GST Invoicing

**Status:** T1–T3 done (deployed). T4–T5 remaining. **Depends on:** R (PDF kit), L (ledger) helpful but not required.

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
- **Part 2 (PDF + UI) — remaining**: `invoiceDoc.tsx` (react-pdf, reuse kit) + a UI entry point to issue/download
  from a B2B merchandise sale, and an invoices list.

## T5 — Reports
- DSSR/shift summary tax breakup (output VAT vs output GST) for the day.

## Open questions
- Rounding rules (per-line vs invoice-level), reverse charge (RCM) — defer.
- E-invoice (IRN/QR) for turnover thresholds — future.
