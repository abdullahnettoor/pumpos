# Frontend Patterns (`apps/web` + `packages/ui`)

The web app is a Vite + React 18 shell. All reusable UI lives in `@pump/ui`; the app
shells (`apps/web`, `apps/desktop`) are thin. **Web-first:** build and iterate on
`apps/web`; the desktop Tauri wrapper consumes the same `@pump/ui` (see
[desktop-patterns.md](desktop-patterns.md)).

## Stack

React · TypeScript · Vite · TanStack Query · TanStack Table · React Hook Form · Zod ·
lucide-react · Supabase JS. Tauri for desktop.

> `apps/web` consumes `@pump/ui` as its **built `dist`** (no vite src alias). After
> editing `@pump/ui`/`@pump/shared`/`@pump/core`, run `npx tsc -b` **and restart
> `dev:web`**.

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
  components/
    primitives/               PageLayout, KpiCard, DataTable
    Drawer, StatusBadge, SyncIndicator, LoadingSpinner, ErrorBoundary
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
const { data, isLoading, error } = useShiftStatus(stationId);     // full status
const expensesQ = useExpenses();                                  // list
const invalidate = useInvalidateOperational();                    // after a mutation
// ...
await txService.recordExpense(payload);
invalidate(stationId);   // refetches shift-status/expenses/etc.
```

Available hooks: `useShiftStatus`, `useShiftSummaries`, `useExpenses`, `usePurchases`,
`useCollections`, `useCustomers`, `useSuppliers`, `useExpenseCategories`, `useProducts`,
`useTanks`, `useInventoryStatus/Movements/Variances`, `useDailyDssr(+Range)`,
`useInvalidateOperational`. Add new ones next to these, keyed via the `queryKeys` factory.

**Forms that must not reset on background refetch** (e.g. the open/close shift forms)
should pass `{ refetchOnWindowFocus: false }` and derive their editable state from the
cached data via an effect keyed on the query data.

## Primitives

| Primitive | Use |
|---|---|
| `PageLayout` | screen header (title/subtitle/actions) + optional toolbar + content |
| `KpiCard` | compact metric tile (mono numbers, semantic tone) |
| `DataTable<T>` | dense, sortable TanStack Table with built-in loading/empty/error states |
| `Drawer` | slide-in panel (prefer drawers over stacked modals) |
| `StatusBadge`, `SyncIndicator`, `LoadingSpinner`, `ErrorBoundary` | state-forward UI |

```tsx
<PageLayout title="Inventory Management" subtitle="…" actions={<button className="btn btn-secondary btn-sm">Refresh</button>}>
  <DataTable columns={cols} data={q.data} isLoading={q.isLoading} error={q.error as Error | null}
    emptyMessage="No records." getRowId={(r) => r.id} initialSorting={[{ id: 'businessDate', desc: true }]} />
</PageLayout>
```

`DataTable` columns are TanStack `ColumnDef<T>` with `accessorKey` + `cell` renderers.

## Forms

Use **React Hook Form + Zod**, reusing the Zod schemas already exported from
`@pump/shared` (e.g. `customerCreateSchema`, `supplierPaymentSchema`):

```tsx
const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(customerCreateSchema) });
```

The `transactions/*EntryForm` components are presentational (props-driven) and reused by
multiple screens. Prefer the editing pattern **List → Drawer → Edit** over modal stacks.

## Design system

Source of truth: [`docs/PUMP-ERP-DESIGN-SYSTEM.md`](../PUMP-ERP-DESIGN-SYSTEM.md) and the
`pump-erp-design-system` skill. "Calm Industrial Precision": compact, light-first,
state-forward, operator-speed.

- **Tokens** (`index.css`): `--bg-*`, `--text-*`, `--brand-primary` (Petrol Green),
  `--brand-secondary` (Diesel Blue), `--brand-warning` (Amber), `--brand-danger` (Red),
  `--state-*-bg/fg`, `--radius-*`, `--space-1..10`. Fonts: IBM Plex Sans / Mono.
- **Classes**: `.btn` + `.btn-sm/md/lg` + `.btn-primary/secondary/danger/ghost`; `.card*`;
  forms `.form-input` / `.form-label` / `.input` / `.select` / `.input-compact` /
  `.textarea` / `.field-label` / `.field-error`; tables `.dense-table` (or use `DataTable`).
- **Prefer tokens + classes over inline styles and raw hex.** Numbers use the mono font.
  Keep operator screens tighter than manager/owner screens. Always handle
  loading/empty/error states.

## Navigation

`App.tsx` routes via a `currentPath` string (no router lib at this size). The sidebar
(`AppShell`) renders role-filtered nav items and calls `onNavigate(path)`. Route gating:
unauthenticated → Login; no station → Onboarding; station not `READY_FOR_OPERATIONS` →
gated.

## Conventions for new screens

1. Read data via query hooks; mutate via `cloud.ts`; refresh via `useInvalidateOperational`.
2. Wrap in `PageLayout`; render lists with `DataTable`.
3. Forms = RHF + Zod (`@pump/shared` schemas) inside a `Drawer`.
4. Use tokens/classes; cover loading/empty/error; mono for numbers.

See [ui-assessment.md](ui-assessment.md) for the current migration status and backlog.
