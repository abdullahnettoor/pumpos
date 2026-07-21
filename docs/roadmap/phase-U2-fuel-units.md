# Phase U2 — Unit-aware fuels (kg for CNG / Auto-LPG)

> **Status: 🟡 Mostly done (implemented; QA pass pending).** Despite the plan-style
> wording below, this is substantially built: `projectShiftSummary` carries `unit` on
> nozzle readings / `fuelByProduct` / credit lines, `ShiftSummaryView` handles L/kg,
> the Dashboard + ReportsOverview render per-unit subtotals, and `formatQty(value,
> decimals, unit?)` takes a unit. **Remaining:** Phase 5 QA — verify onboarding/setup
> unit labels and render a real mixed-unit (CNG kg) station end to end.

Make fuel quantities unit-aware across PumpOS so a CNG / Auto-LPG station reads in
**kg** while liquid fuels stay in **L**. Petrol/Diesel are unaffected.

## Principles

- **Single source of truth:** `products.unit` (already exists). A **tank inherits its
  unit from its mapped product** (`tanks.product_id`); a nozzle inherits from its
  tank/product. **No DB migration** — no new columns.
- **Never convert kg ↔ L.** Every product's quantities stay in its own unit end to end
  (metering, stock, dip, variance, reports). CNG mass↔volume depends on pressure and
  temperature, so any fixed-ratio conversion is wrong.
- **Nozzle math is unit-agnostic:** `closing − opening` is identical; only the displayed
  unit label changes (a CNG mass-flow totaliser reads kg).
- **Mixed-unit stations:** never sum L + kg. Grand totals render **per-unit subtotals**
  (e.g. `4,336.000 L · 812.000 kg`); the product-wise table already groups per product
  (each with its own unit) and is the authoritative place for totals.
- **Legacy column names kept:** `tanks.capacity` (commented "Liters") and
  `products.threshold_litres` stay; they hold a unit-agnostic quantity and are only
  **relabelled in the UI**. No migration.

## Work

### Phase 1 — API data plumbing
- `projectShiftSummary` (`apps/api/src/routes/shifts.ts`): add `unit` (from the joined
  product) to each `nozzleReading`, `fuelByProduct` group, `dipReading`, `stockVariance`,
  and credit-sale line.
- Shift **status** payload: carry each nozzle's product `unit` (live shift-open flow).
- Tanks list endpoint: join `products.unit`.
- Inventory + DSSR stock-variance already carry `unit` — verify only.

### Phase 2 — Shift summary (view + PDF)
- `formatQty(value, decimals, unit?)` appends the unit; replace hardcoded ` L` / `(L)`.
- Nozzle table, product-wise table, dip reconciliation, stock variance, credit qty.
- **Per-unit subtotals** on the nozzle grand-total row and the "Net Volume Sold" KPI.

### Phase 3 — Onboarding & setup UI
- Tank capacity + opening-stock labels derive `(kg)`/`(L)` from the mapped product's unit
  (`Step4Tanks`, `Step6OpeningValues`, `Step8Review`, `TanksGrid`).
- Nozzle current-reading label (`DispensersList`).

### Phase 4 — Live shift flow + dashboards/reports
- `OpenShiftForm`, `NozzleReadingsGrid`, `HandoverDrawer` volume labels.
- `DailyDssrView`, `ReportsOverview`, `InventoryList`, customer credit-qty column,
  `ProfitLossView` volume, pricing panel `₹/unit`.

### Phase 5 — QA
- Seed a CNG product → kg tank → nozzle; run a full shift; verify summary / PDF / DSSR /
  inventory read kg.
- Verify a mixed L+kg station never shows an added-together total.

## Fuel → unit reference

| Fuel | Unit |
|---|---|
| Petrol / MS, Diesel / HSD, Ethanol blends | L |
| CNG, Auto-LPG, LNG, CBG (Bio-CNG) | kg |
| EV charging (future) | kWh |
