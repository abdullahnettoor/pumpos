# Phase U — UI Uplift & Consistency

**Goal:** bring all screens to the depth/polish of Shifts, on the design system. No backend changes.

## What exists
- Rich: Shifts. Functional/uneven: Expenses, Purchases, Customers, Inventory, Reports.
- Primitives: `PageLayout`, `DataTable`, `KpiCard`, `Drawer`. ExpensesList already on DataTable.

## U1 — DataTable migration
- PurchasesList (3 raw `<table>`), CustomersList (registry 10-col w/ in-cell actions) → `DataTable` columns + in-cell action renderers. Visual parity check.

## U2 — Forms → RHF + Zod
- Standardize entry forms (Expense/Purchase/Collection/Merchandise) on react-hook-form + shared Zod schemas (`@pump/shared`).

## U3 — Page shells & KPIs
- Consistent `PageLayout` + KPI header per screen; list → drawer → edit everywhere; reduce modals.

## U4 — Typed API client
- Replace ad-hoc `request()` calls with a typed client sharing schemas.

## U5 — Performance
- Route-based code-splitting (resolves current >500kb chunk warning); lazy-load heavy deps (pdf, react-pdf).

## Expansion
- Theming/dark mode, command palette, saved views, density toggle, a11y pass, empty/skeleton states.
