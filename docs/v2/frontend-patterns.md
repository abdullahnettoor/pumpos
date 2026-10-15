# Frontend Patterns (`apps/console` + `packages/ui`)

The operational console is a Vite + React shell. Reusable UI lives in `@pump/ui`;
the console and desktop shells share it, with desktop-only native integrations
kept behind platform seams (see [desktop-patterns.md](desktop-patterns.md)).

## Stack

React · TypeScript · Vite · TanStack Query · TanStack Table · React Hook Form · Zod ·
lucide-react · Supabase JS. Tauri for desktop.

> `apps/console` consumes `@pump/ui` as its **built `dist`** (no Vite src alias). After
> editing `@pump/ui`/`@pump/shared`/`@pump/core`, run `npx tsc -b` **and restart
> the console dev server**.

## Layout

```
packages/ui/src/
  index.ts                    barrel
  index.css                   design tokens + component/utility classes
  query/
    queryClient.tsx           createQueryClient + <QueryProvider>
    hooks.ts                  query hooks + queryKeys + useInvalidateOperational
  services/
    cloud.ts                  HTTP service layer (envelope unwrapping)
    supabase.ts               Supabase client
  pump-ds/                    design system: Button, Input/Select, Chip, KpiTile, tables, …
  statement/, office-records/ Statement module; Office Record entry + keyed save
  components/
    page-frame/               PageFrame
    primitives/               Field, Banner, Toggle, Combobox, ConfirmDialog, Toast, DataTable
    Drawer, SyncIndicator, ErrorBoundary
    AppShell, Dashboard/, Shifts/, StationSetup/, transactions/, *List.tsx
```

App roots are wrapped:

```tsx
<ErrorBoundary>
  <QueryProvider client={createQueryClient()}>
    <App />
  </QueryProvider>
</ErrorBoundary>
```

## Service layer (`cloud.ts`)

Thin classes (`CloudShiftService`, `CloudTransactionService`, `CloudStationService`, …)
wrap `fetch`. A single `request<T>()` helper attaches the auth bearer token, unwraps the
`{ success, data }` envelope, and throws an `Error` (with `code`/`status`) on failure.
Paths target the v2 API: `/setup/*`, `/shifts/*`, `/transactions/*`, `/dssr/*`.

Add a backend endpoint → add a method here → add a query hook (below).

## Data fetching — TanStack Query (REQUIRED for new screens)

Do **not** hand-roll `useState + useEffect + fetch`. Use the shared hooks in
`query/hooks.ts`. One cache, one source of truth — e.g. shift status is a single cached
entry shared by Dashboard/Expenses/Purchases/Customers/Shifts (previously an N+1).

```ts
const stationId = selectedStation?.id ?? null;
const { data, isLoading, error } = useShiftStatus(stationId); // full status
const expensesQ = useExpenses(); // list
const invalidate = useInvalidateOperational(); // after a mutation
// ...
await txService.recordExpense(payload);
invalidate(stationId); // refetches shift-status/expenses/etc.
```

Available hooks: `useShiftStatus`, `useShiftSummaries`, `useExpenses`, `usePurchases`,
`useCollections`, `useCustomers`, `useSuppliers`, `useExpenseCategories`, `useProducts`,
`useTanks`, `useInventoryStatus/Movements/Variances`, `useDailyDssr(+Range)`,
`useInvalidateOperational`. Add new ones next to these, keyed via the `queryKeys` factory.

**Forms that must not reset on background refetch** (e.g. the open/close shift forms)
should pass `{ refetchOnWindowFocus: false }` and derive their editable state from the
cached data via an effect keyed on the query data.

## Primitives

The module catalog is [`packages/ui/src/pump-ds/README.md`](../../packages/ui/src/pump-ds/README.md)
("Modules"). The ones every screen uses:

| Module                                                         | Use                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `PageFrame`                                                    | page header: back link, title, actions, tabs, toolbar, then content          |
| `SectionHeader` + `ControlBar`                                 | in-page heading; its `controls` sit directly above the table they filter     |
| `KpiTile` / `TileSection`                                      | at most 4 tiles, each with a period chip                                     |
| `DataSection`                                                  | a region that loads its own data (loading / refused / error + Retry / empty) |
| `InteractiveTable`, `GroupedTable`, `StatementTable`           | tables from one `TableColumn<T>[]`, with total rows                          |
| `Drawer`                                                       | slide-in panel (prefer drawers over stacked modals)                          |
| `StatusChip`, `VarianceChip`, `SyncIndicator`, `ErrorBoundary` | state-forward UI                                                             |

```tsx
<PageFrame route={ROUTES.inventory} actions={<Button variant="secondary">Refresh</Button>}>
  <DataSection title="Stock movements" query={q} placeholderHeight={240} shape="bare">
    <InteractiveTable columns={cols} rows={q.data ?? []} rowKey={(r) => r.id} />
  </DataSection>
</PageFrame>
```

## Forms

Use **React Hook Form + Zod**, reusing the Zod schemas already exported from
`@pump/shared` (e.g. `customerCreateSchema`, `supplierPaymentSchema`):

```tsx
const {
  register,
  handleSubmit,
  formState: { errors },
} = useForm({ resolver: zodResolver(customerCreateSchema) });
```

The `transactions/*EntryForm` components are presentational (props-driven) and reused by
multiple screens. Prefer the editing pattern **List → Drawer → Edit** over modal stacks.

## Design system

Source of truth: [`docs/PUMP-ERP-DESIGN-SYSTEM.md`](../PUMP-ERP-DESIGN-SYSTEM.md) and the
`pump-erp-design-system` skill. "Calm Industrial Precision": compact, light-first,
state-forward, operator-speed.

- **Tokens** (`index.css`): `--bg-*`, `--text-*`, `--brand-primary` (Petrol Green),
  `--brand-secondary` (Diesel Blue), `--brand-warning` (Amber), `--brand-danger` (Red),
  `--state-*-bg/fg`, `--text-on-*`, `--shadow-*`, `--overlay-*`, `--focus-ring`,
  `--radius-*`, `--space-1..10`. Fonts: Plus Jakarta Sans / Geist Mono.
- **Styling**: Tailwind utilities over those tokens (`bg-surface`, `text-ink-muted`,
  `border-border-soft`) and pump-ds components (`Button`, `Input`, `Select`, `Chip`).
  The legacy `.btn-*`, `.card*`, `.badge-*`, `.form-*` and `.dense-table` classes were
  deleted in #539. The plain classes left in `index.css` are the drawer, the form field
  (`.field-label`, `.input`, `.textarea`) and print (`.print-area`, `.no-print`).
- **No inline styles or raw hex.** The style check (`npm run test:classes -w @pump/ui`)
  fails on raw colours. Nothing below 12px except 10px table headers. Numbers use the
  mono font. Always handle loading/empty/error states.

## Navigation

`App.tsx` routes via a `currentPath` string (no router lib at this size). The sidebar
(`AppShell`) renders role-filtered nav items and calls `onNavigate(path)`. Route gating:
unauthenticated → Login; no station → Onboarding; station not `READY_FOR_OPERATIONS` →
gated.

## Conventions for new screens

1. Read data via query hooks; mutate via `cloud.ts`; refresh via `useInvalidateOperational`.
2. Wrap in `PageFrame`; load regions through `DataSection`; render lists with
   `InteractiveTable`.
3. Forms = RHF + Zod (`@pump/shared` schemas) inside a `Drawer`; save through
   `useKeyedSave`.
4. Use tokens and pump-ds components; cover loading/empty/error; mono for numbers.

See [ui-assessment.md](ui-assessment.md) for the current migration status and backlog.
