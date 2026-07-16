# UI Assessment & Refactor Roadmap

A living record of the frontend's state, the design-quality review, and the migration
backlog. Updated as the v2 UI refactor proceeds.

## Design quality (vs the design system)

**Foundation: strong.** Tokenized "Calm Industrial Precision" palette (Petrol Green /
Diesel Blue / Amber / Red), IBM Plex Sans/Mono, 4px spacing grid, compact radii,
light-first, drawers over modals, `StatusBadge`/`SyncIndicator` for state-forwardness.
Genuinely aligned with the spec; avoids the "generic purple SaaS" trap.

**Execution: improving but inconsistent.** The gap is between the (good) tokens and the
(historically inline, duplicated) implementation. The v2 refactor is closing it via a
shared data layer + primitives + utility classes.

## Refactor status

**Done**
- TanStack Query data layer: `QueryProvider` (web + desktop), `queryKeys`, ~16 hooks,
  `useInvalidateOperational`. Removed the `getShiftStatus` N+1 and per-screen fetch loops.
- Primitives: `PageLayout`, `KpiCard`, `DataTable` (TanStack Table, with loading/empty/error).
- `ErrorBoundary` at both app roots.
- CSS utility classes: `.input`, `.select`, `.input-compact`, `.textarea`, `.field-label`,
  `.field-error` (alongside existing `.form-input`/`.form-label`/`.dense-table`).
- Migrated onto the query layer: **Dashboard, Inventory, Expenses, Purchases, Customers,
  ShiftsManagement**. Inventory + Expenses also moved onto `DataTable`.
- Fixed latent `shiftDate` → `businessDate` field drift (inventory + expenses) introduced
  by the backend rewrite.
- Started splitting `ShiftsManagement`: extracted `ShiftCloseSuccess`.

**In progress / backlog**
1. **`ShiftsManagement` structural split** (≈1,200 LOC). Remaining inline blocks: idle
   open-shift form, active workspace (Attendant Handovers Dashboard table + KPI strip),
   quick-entry drawer, handover drawer. **Extract incrementally with the dev server
   running** — blind extraction of the most critical operational screen is risky.
2. **Forms → RHF + Zod** everywhere (only `CustomersList` uses it today; entry forms are
   presentational). Reuse `@pump/shared` Zod schemas.
3. **Purchases/Customers inner tables → `DataTable`** (cosmetic; data layer already done).
4. **Accessibility pass**: input labels/ARIA, focus order, hand-rolled comboboxes
   (vehicle search).
5. **Bundle size**: web bundle ~1 MB; add route-level code-splitting / `manualChunks`.
6. **State seam**: a small `useSession()`/`useSelectedStation()` (Zustand or context) to
   stop prop-drilling global state.

## Known smells (tracked)

| Smell | Where | Plan |
|---|---|---|
| Monolithic component | `ShiftsManagement.tsx` | incremental extraction (see #1) |
| Heavy inline styles | most screens | migrate to tokens/classes opportunistically |
| Mixed form patterns | entry forms vs `CustomersList` | standardize on RHF+Zod (#2) |
| Hand-rolled tables | Purchases/Customers | `DataTable` (#3) |
| Prop drilling | global state via props | client-state seam (#6) |
| Backend-shape coupling | screens read `/shifts/status` shape as `any` | a typed client later |
| No code-splitting | single ~1 MB chunk | `manualChunks` (#5) |

## Do we need a redesign?

**No full redesign.** Surgical redesigns worth doing:
- The **operational/shift screen** → a single "operating today" workspace (header KPIs +
  transaction ledger + quick-entry drawer) instead of the monolith + scattered lists.
- **List screens → one dense `DataTable`** (export/print-friendly per the spec).
- **Reports/DSSR** → make explicitly export- and print-friendly.

## Migration recipe (per screen)

1. Replace manual loaders with query hooks; mutate via `cloud.ts`; refresh with
   `useInvalidateOperational`.
2. Wrap in `PageLayout`; render lists with `DataTable`.
3. Move forms to RHF + Zod inside a `Drawer`.
4. Swap inline styles for tokens/utility classes; cover loading/empty/error.
5. `npx tsc -b` + `npm run build --workspace=apps/web`; restart `dev:web`; verify visually.
