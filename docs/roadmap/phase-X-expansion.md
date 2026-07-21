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
- **🟡 Partially shipped:** the OMC-CMS settlement side is done — a `CMS` money account, OMC fleet-card fuel sales posting **money-in to CMS** (payment channel, not a receivable) with per-line customer/vehicle/remarks traceability for reconciling against the OMC's account, and supplier pay-from-CMS. **Still deferred:** *station*-held prepaid wallet drawdown (top-up + balance debit); `TopupDrawer.tsx` is retained for it.

## X5 — Hardware / POS integrations
- Dispenser/ATG/forecourt controller feeds → nozzle readings/dips; printer/cash-drawer; POS pass-through. Keep nozzle-derived sales authoritative.

## X6 — Merchandise reorder points (low-stock alerts)
- **Why:** today merchandise only alerts when `quantity < 0` (oversold). There is no proactive low-stock warning for non-fuel items — operators find out only after overselling. Fuel tanks already warn by % of capacity (`packages/ui/src/utils/stock.ts`).
- **Scope:**
  - Add an optional `reorderLevel` (numeric, per product/unit) to products — column or `metadata` JSONB; surface it in the product create/edit form (Station → Products).
  - In `useStationAlerts` (marked `TODO (C)`), raise a `warning` `stock` alert when `0 <= quantity <= reorderLevel`, deep-linking to the Merchandise tab (`actionTab: 'items'`) like oversold does.
  - Add a "Low Stock" KPI tile + an "At/Below reorder" chip in the merchandise On-Hand column (alongside existing Out of stock / Oversold chips).
  - Optional: default reorder level per product type; per-station override in `stations.settings`.
- **Non-goals:** automated PO generation — that layers on later (purchasing).

## Cross-cutting
- Custom roles/permissions (enterprise), custom expense categories, multi-station consolidation, audit/event explorer UI.
