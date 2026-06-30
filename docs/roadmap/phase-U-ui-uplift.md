# Phase U — UI Uplift & Consistency

**Goal:** bring all screens to the depth/polish of Shifts, on the design system. No backend changes.

## What exists
- Rich: Shifts. Functional/uneven: Expenses, Purchases, Customers, Inventory, Reports.
- Primitives: `PageLayout`, `DataTable`, `KpiCard`, `Drawer`. ExpensesList already on DataTable.

## U1 — DataTable migration
- Migrated to `DataTable` (in-cell action/ledger renderers, sortable, parity): PurchasesList ✅, CustomersList ✅,
  ProductsCatalog ✅ (tax column now VAT/GST/Exempt category-aware), PaymentTerminalsPanel ✅, UserRolesAssignment ✅.
  Remaining: FuelPricingPanel (specialized price-history / inline-edit table).

## U2 — Forms → RHF + Zod
- Standardize entry forms (Expense/Purchase/Collection/Merchandise) on react-hook-form + shared Zod schemas (`@pump/shared`).

## U3 — Page shells & KPIs
- Consistent `PageLayout` + KPI header per screen; list → drawer → edit everywhere; reduce modals.

## U4 — Typed API client
- Replace ad-hoc `request()` calls with a typed client sharing schemas.

## U5 — Performance ✅ (PDF lazy-load done)
- Report config/labels/letterhead extracted to plain modules (`reportConfig.ts`, `letterhead.ts`); the react-pdf
  doc modules + `exportReactPdf` are now **dynamic-imported only on "Save PDF"**. Main bundle 2,360 kB → 1,041 kB;
  `@react-pdf/renderer` (1.3 MB) + html2pdf (668 kB) are deferred lazy chunks. Remaining: route-level code-split of heavy screens.

## Expansion
- Theming/dark mode, command palette, saved views, density toggle, a11y pass, empty/skeleton states.
