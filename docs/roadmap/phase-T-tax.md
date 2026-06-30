# Phase T — Product Tax Restructure & GST Invoicing

**Status:** planned (own phase — large, cross-cutting). **Depends on:** R (PDF kit), L (ledger) helpful but not required.

**Goal:** Model Indian fuel-retail taxation correctly and enable **B2B GST tax invoices** with CGST/SGST/IGST line splits, while keeping fuel (VAT, outside GST) distinct from merchandise/lubes (GST).

## Domain facts (confirmed)
- **Petrol, diesel, ATF, crude, natural gas are OUTSIDE GST** → state **VAT** only (no input tax credit for the buyer).
- **Lubricants, additives, merchandise → GST.** Intra-state = **CGST + SGST** (split 50/50); inter-state = **IGST**. Post-Sep-2025 slabs: 0 / 5 / 18 / 40 (lubes/most merch = 18).
- CGST/SGST vs IGST is decided at **document time** by buyer-state vs station-state (place of supply) — never stored on the product.

## T1 — Product tax model
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

## T5 — Reports
- DSSR/shift summary tax breakup (output VAT vs output GST) for the day.

## Open questions
- Rounding rules (per-line vs invoice-level), reverse charge (RCM) — defer.
- E-invoice (IRN/QR) for turnover thresholds — future.
