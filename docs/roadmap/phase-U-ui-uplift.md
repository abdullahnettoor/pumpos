# Phase U — UI Uplift & Consistency

**Goal:** bring all screens to the depth/polish of Shifts, on the design system. No backend changes.

## What exists
- Rich: Shifts. Functional/uneven: Expenses, Purchases, Customers, Inventory, Reports.
- Primitives: `PageLayout`, `DataTable`, `KpiCard`, `Drawer`. ExpensesList already on DataTable.

## U1 — DataTable migration
- Migrated to `DataTable` (in-cell action/ledger renderers, sortable, parity): PurchasesList ✅, CustomersList ✅,
  ProductsCatalog ✅ (tax column now VAT/GST/Exempt category-aware), PaymentTerminalsPanel ✅, UserRolesAssignment ✅.
  Remaining: FuelPricingPanel (specialized price-history / inline-edit table) — now relocated to a
  top-level **Fuel Pricing** nav view (out of Station Overview, since prices change often).

## U2 — Forms → RHF + Zod ✅
- Entry forms (Expense/Purchase/Collection/Merchandise) are now **self-contained**: each owns its
  state via react-hook-form + a shared Zod schema in `@pump/shared`
  (`expenseEntryFormSchema`, `collectionEntryFormSchema`, `purchaseEntryFormSchema`,
  `merchandiseSaleEntryFormSchema`; string-friendly via `z.coerce.number`). Forms expose
  `defaultValues` + `onSubmit(values)` (Purchase also yields tank `allocations`); product→price
  autofill, tank-allocation and stock lookups moved into the forms.
- Consumers rewired: `ExpensesList`, `CustomersList` (collection), `PurchasesList`, and
  `ShiftsManagement`/`QuickEntryDrawer` — the latter slimmed from ~60 threaded props to data
  sources + per-form defaults + validated submit handlers. Build + shared tests green.

## U3 — Page shells & KPIs
- **Tabs primitive ✅** — new accessible `Tabs` (`primitives/Tabs.tsx`, `role=tablist/tab`, ←/→/Home/End keys,
  icon + badge support). Migrated every bespoke `borderBottom` tab strip onto it: ReportsOverview, InventoryList,
  PurchasesList, CustomersList, StationOverview, ShiftsManagement subtabs (Today/Planning/History + "Open" badge),
  ShiftTransactionsPanel. Removed the 3 divergent tab implementations.
- Remaining: consistent `PageLayout` + KPI header per screen (Reports/Shifts still hand-roll); de-dup shift
  transaction entry (QuickEntryDrawer vs ShiftTransactionsPanel); split overloaded Station "General Info";
  replace `alert()`/`window.confirm` with drawer/confirm; gate dead Reports "Custom Reports" tab.
- **Confirm dialog ✅** — new promise-based `ConfirmProvider` + `useConfirm()` (`primitives/ConfirmDialog.tsx`,
  styled `role=alertdialog`, Esc/Enter, danger variant). Both apps wrapped in `main.tsx`. Migrated all destructive
  `window.confirm` sites (delete vehicle, reopen shift ×2, discard onboarding draft). Found the `ShiftTransactionsPanel`
  "redundancy" is actually a distinct **post-close audit console** (ShiftSummaryView), not a dup — removed only the
  dead import in ShiftsManagement. Remaining native dialogs are `alert(err)` error popups (→ future inline/toast).
- **Station "General Info" split ✅** — was overloaded; now two setup tabs: **General Info** (station basics +
  operations/timezone/day-start + onboarding status) and **Business & Branding** (legal/tax GSTIN/stateCode/RO code +
  branding/logo + report-section toggles), each with its own edit/view + save that merges into `settings` without
  clobbering the other group.
- **Reports on `PageLayout` + Custom Reports gated ✅** — ReportsOverview now uses `PageLayout` (title/subtitle +
  Refresh action); the dead "Custom Reports — Coming Soon" tab is gated behind `SHOW_CUSTOM_REPORTS=false` (tab strip
  hidden while only DSSR exists).
- Remaining: `PageLayout`/`KpiCard` on the hand-rolled parts of Shifts (deferred — deliberate custom layout).
- **Toast notifications ✅** — new `ToastProvider` + `useToast()` (`primitives/ToastProvider.tsx`, stacked top-right,
  auto-dismiss, error/success/info variants). Both apps wrapped in `main.tsx`. Migrated **all** ~24 native `alert(err)`
  popups across 11 components to `toast.error(...)` (plus the ProductsCatalog archive `confirm` → `useConfirm`). No
  native `alert`/`confirm` left in the UI — U3 dialog/notification cleanup complete.

## U4 — Typed API client
- Replace ad-hoc `request()` calls with a typed client sharing schemas.

## U5 — Performance ✅ (PDF lazy-load done)
- Report config/labels/letterhead extracted to plain modules (`reportConfig.ts`, `letterhead.ts`); the react-pdf
  doc modules + `exportReactPdf` are now **dynamic-imported only on "Save PDF"**. Main bundle 2,360 kB → 1,041 kB;
  `@react-pdf/renderer` (1.3 MB) + html2pdf (668 kB) are deferred lazy chunks. Remaining: route-level code-split of heavy screens.

## Expansion
- Theming/dark mode, command palette, saved views, density toggle, a11y pass, empty/skeleton states.
