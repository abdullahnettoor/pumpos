# Phase X — Expansion Modules

**Goal:** add modules by extending existing entities/events; no core redesign. Each is independent.

## X1 — Attendance
- Staff check-in/out tied to shift/business day; events `ATTENDANCE_*`; payroll-ready hours; reuse users + LedgerView pattern.

## X2 — WhatsApp / notifications
- Cloudflare email/WhatsApp provider; templated DSSR/shift summary + collection reminders; per-station opt-in config (JSONB).

## X3 — GST exports
- GSTR-1/3B-ready exports from sales/purchases + tax JSONB; HSN summary; CSV/XLSX/PDF.

## X4 — Prepaid fleet top-up (OMC-CMS)
- Extend prepaid customers; `paymentMethod: FleetCard`; balance draw-down; reconcile vs OMC settlement; ledger via Phase L.

## X5 — Hardware / POS integrations
- Dispenser/ATG/forecourt controller feeds → nozzle readings/dips; printer/cash-drawer; POS pass-through. Keep nozzle-derived sales authoritative.

## Cross-cutting
- Custom roles/permissions (enterprise), custom expense categories, multi-station consolidation, audit/event explorer UI.
