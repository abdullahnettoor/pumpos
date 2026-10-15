# pump-ds

The canonical PumpOS design system. Every primitive lives under this folder;
the few app-aware modules built on it (Page Frame, Statement, Office Record
entry) live beside it in `packages/ui/src`. The UI identity milestone (#515)
moved every page onto these modules; #539 deleted what they replaced.

## Modules

Reach for these before writing markup. Each row names where it lives and the
one thing it decides, so a page never decides it again.

| Module                  | Where                                                                                                              | Use it for                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Page Frame**          | `components/page-frame` (`PageFrame`)                                                                              | How every page starts: optional top-left `back` link (`BackLink`, never top-right), title + subtitle + actions (one primary, top right), then `tabs`, then `toolbar`. A sidebar page names its `route` and takes the sidebar label as its title.                                                                                                       |
| **Section header**      | `section-header` (`SectionHeader`)                                                                                 | The one in-page heading: 12px uppercase muted title, optional context line and link. With `controls` it heads a filtered table and renders a `ControlBar` (layout B).                                                                                                                                                                                  |
| **Control bar**         | `control-bar`, `date-range`, `filter-chips`, `export`, `segmented`, `tabs`                                         | The controls of a table or report, in a fixed order: `DateRangeMenu` (one button), search, `FilterChips` (row filters with counts), `SegmentedControl` (2–4 views of the same data), then `ExportMenu` and the info tip at the right end. Tabs are sections of a page. A dropdown (`Select`) for 5+ options. Filters apply instantly: no Apply button. |
| **KPI tiles**           | `kpi` (`KpiTile`, `KpiStrip`, `TileSection`)                                                                       | At most 4 tiles (`MAX_KPI_TILES`), each with a `scope` period chip (Today · Oct · Now). Figures are plain; colour comes only from `alert` (red and amber mean a problem). A ledger's tile never repeats its table's total (Reports pages may).                                                                                                         |
| **Data Section**        | `data-section` (`DataSection`)                                                                                     | A region that loads its own data: skeleton, refused, "Couldn't load … · Retry", empty, content. See rule 6 below.                                                                                                                                                                                                                                      |
| **Status vocabulary**   | `chip` (`StatusChip`, `VarianceChip`, `STATUS_MAP`)                                                                | Every status word, its icon and its tone, from one map; variance through `VarianceChip` and the one balanced rule (`isBalancedVariance`). Never colour a status by hand.                                                                                                                                                                               |
| **Table**               | `table` (`InteractiveTable`, `GroupedTable`), `statement-table` (`StatementTable`)                                 | One `TableColumn<T>[]` for all three. `InteractiveTable` sorts and selects; `GroupedTable` groups rows under header rows; `StatementTable` is the compact read-only table a report is made of. Total rows, stored totals and custom total cells (`cells` / `texts`): see **Tables** below.                                                             |
| **Statement**           | `statement/` (`StatementView`, `buildLedgerStatement`, `statementDocProps`)                                        | Every ledger (customer, supplier, cash, bank, a Daily Cash Book account): adapter → `buildLedgerStatement` → `statementLines` → the screen or the PDF, so both read the same rows, opening and closing.                                                                                                                                                |
| **Tank gauge**          | `tank-gauge` (`TankGauge`)                                                                                         | One tank's level, % and days of cover. The tone comes from the station's tank levels (`deriveTankLevel` + `resolveTankLevelSettings`); the gauge never picks a threshold.                                                                                                                                                                              |
| **Density display**     | `density` (`DensityReading`, `deriveDensityState`, `formatDensityReading`)                                         | One fuel's density at 15 °C, the observed value, change vs yesterday, a sparkline and the "Unexplained jump" / "Not recorded" chips; identical on the Dashboard and Inventory.                                                                                                                                                                         |
| **Office Record entry** | `office-records/` (`OfficeRecordDrawer`, `officeRecordRequest`)                                                    | The one drawer that records an expense, income, collection, purchase or supplier payment, from a page, the New menu, a statement or Shifts: a form per kind, a live preview, and a pinned footer.                                                                                                                                                      |
| **Keyed save**          | `office-records/useKeyedSave.ts`, `office-records/submitKeys.ts` (`useKeyedSave`, `sendKeyed`, `officeSubmitKeys`) | Every mutation's Idempotency-Key. `useKeyedSave('<route>:<record>')` in a form (one key per mounted form); `sendKeyed(officeSubmitKeys.session(scope), body, send)` outside a component. An unknown outcome keeps the key, so saving again cannot record twice.                                                                                        |
| **Skeleton, Spinner**   | `skeleton` (`Skeleton`, `SkeletonGrid`), `spinner` (`Spinner`)                                                     | Placeholders shaped like the content. `SkeletonGrid` only while a whole page's shape is unknown; a spinner only on the boot screen and inside a busy `Button`. Both hold still under reduced motion.                                                                                                                                                   |
| **Form controls**       | `button`, `input` (`Input`, `SearchInput`, `Select`), `form`; `components/primitives/Field.tsx`                    | `Button` (one primary per page), the one `Select` (also re-exported by `Field.tsx`), and `Field` for a label (12px, neutral `*` for required), hint and error.                                                                                                                                                                                         |

## Rules of the road

1. **Single source of truth for tokens** stays `packages/ui/src/index.css`.
   `pump-ds/tailwind.css` only mirrors those `--*` variables into Tailwind's
   `@theme` namespace. Change a raw value in one place; both the plain CSS
   classes and the Tailwind utilities pick it up. Elevation has tokens too:
   `--shadow-popover`, `--shadow-dialog`, `--shadow-tooltip` and
   `--overlay-scrim` (deeper in dark), used as `shadow-(--shadow-popover)`.

2. **Every primitive must ship with** default, hover, focus-visible, active,
   disabled, loading, and error states. Motion must honor
   `prefers-reduced-motion`. Keyboard-reachable end-to-end.

3. **No `emerald-*` / `violet-*` / `rose-*` / `sky-*` etc. from Tailwind's
   default palette.** Use the tokenized colors: `bg-brand`, `text-ink-strong`,
   `border-border-soft`, `bg-success-bg`, `text-warning-fg`, etc.

4. **Beste (and any other external UI catalog) is inspiration only.** If a
   piece is worth adopting, extract the shape into a `pump-ds/` primitive
   with our naming, our tokens, and our a11y contract. Do not ship an
   anonymous `Calendar4` or `Browser2` into product screens.

5. **Naming maps to the domain, not the catalog.** `BusinessDayPill`, not
   `DatePill4`. `StatusChip`, not `Badge12`.

6. **Never show an empty state for a failed query.** "No expenses yet" when
   the request failed tells the operator something false. A region that
   loads its own data goes in a `DataSection` (`data-section/`), given the
   query results themselves:
   - **loading** only while `isPending && fetchStatus !== 'idle'` — a skeleton.
     A query paused offline (`fetchStatus: 'paused'`) is still loading, never
     empty. Don't key on `isLoading`: it is false for a paused query.
   - **not yet requested** (`isPending`, `fetchStatus: 'idle'` — disabled or
     waiting on a dependency; TanStack v5 keeps it pending forever) renders
     nothing, or the skeleton when `enabled` is passed `true`.
   - **refused** (403 / `FORBIDDEN`, or `isAccessPolicyError`:
     `CAPABILITY_NOT_ENTITLED`, `LIMIT_REACHED`, `SUBSCRIPTION_RESTRICTED`,
     `ORGANIZATION_SUSPENDED`) shows the server's refusal message and **no
     Retry** — retrying can't change the answer. Only when every failure is a
     refusal.
   - **failed** (any other failure, even mixed with refusals) shows "Couldn't
     load <title> · Retry" (Retry refetches only the failed queries that can be
     retried, never the refused ones). The title reads mid-sentence, so it is
     lowercased word by word, except an acronym (two or more letters, all
     capitals): "Couldn't load the DSR", "Couldn't load GST totals".
   - **empty** only after every query succeeded with nothing to show,
     otherwise the content.

   One section failing never blanks the page. `shape="card"` frames every
   state in a Panel, `shape="cards"` frames only loading/error (for content
   that is itself bordered cards), `shape="bare"` adds no frame for a
   table/list region (`DataTable` does this itself; pass it `title`,
   `error={q.error}` and `onRetry={q.refetch}`). Gate with `enabled`, and give
   the queries the same flag so a hidden section sends no request.

## Tables

`table/` and `statement-table/` take one `TableColumn<T>[]`; the column's
`kind` (`money`, `qty`, `date`, `text`, `status`) sets how it reads.

- **Headers** are all the same: 10px, uppercase, weight 500, faint sans. A
  money or qty header is right-aligned over its figures and nothing else.
  Table headers are the only text below 12px in the app (#515).
- **Body text** is 13px in `InteractiveTable` and `GroupedTable`, 12px in
  `StatementTable` (screen and print).
- **Money and qty cells** are right-aligned mono with tabular digits, at
  regular weight. Only the total row is semibold, so it stands out from the
  figures above it. Don't set `emphasis` on a column that has a total row.
- **Dates** are sans with tabular digits.
- **Quantities** take their unit's decimals (2 for litres). Only meter
  readings take 3 (`decimals: 3`), and they set `total: false`.
- **Total row.** Money adds up in paise. An empty cell adds nothing. A broken
  figure (non-finite) makes the total `—`, never a sum that counted it as 0.
  A qty column with mixed units totals `—`.
- **Stored totals.** `totalRow={{ values, derive: false }}` prints only the
  figures in `values` and never sums a column, for a report whose totals are
  stored (the DSR). A column missing from `values` is blank, and `null`
  prints `—` (a figure that is not added up, such as volumes across L and
  kg). Keep the label `Total` and say why in a note under the table (the DSR
  does). `units` names a qty figure's unit when it is not the rows' own (the
  DSR's shift total takes the day's fuel unit).
- **Custom total cells.** `totalRow.cells` renders a total cell yourself, as a
  column's `cell` does for a row: the Drawers table's variance total is a
  `VarianceChip` (#534). Pair it with `totalRow.texts`, that cell as plain text
  (`Balanced`, `−₹220.00`), as a column pairs `cell` with `text`; without
  `texts`, `totalTexts` prints the figure in `values`. Keep the figure in
  `values` either way, so the totals stay readable to anything that reads them.
- **Sorting** puts empty and broken values last in either direction.
- **`selectedRowId`** (`InteractiveTable`) marks the row whose detail the
  screen shows (a picked Business Day): `aria-current` and the highlight tint,
  without the scroll that `highlightRowId` (a deep link) does.
- **PDF.** `cellText` and `totalTexts` read a cell and the total row as plain
  text, for a PDF that prints the screen's table (the DSR, #580). A column whose
  `cell` changes the words or figures sets `text` too, so both print the same.

### GroupedTable

`GroupedTable` is a read-only working table whose rows fall into groups, each
under a full-width header row: the nozzles of each Drawer under "DU1 · Ravi",
with that Drawer's status and button in the header.

- **Same columns** as `InteractiveTable` and `StatementTable`, and the same
  13px look.
- **Not sortable**: sorting would break the groups apart, so rows keep the
  order given, group by group.
- **Group headers** take any node (`header`); `muted` reads a group's rows
  quieter (figures not in yet).
- **Total row** sums every group's rows, or prints `totalRow.values` when the
  caller decides what counts (Live shift leaves out Drawers still out). The
  label spans the leading columns that add nothing up, so a label that names
  what it leaves out ("Total excl. DU2") has room to read.

## Style check

`classGuard.test.ts` scans every source file in `packages/ui/src` (tests
excluded) and counts, per file:

| Rule             | Flags                                                                                |
| ---------------- | ------------------------------------------------------------------------------------ |
| `dead-class`     | Tailwind classes that generate no CSS (`bg-line`, `text-accent`)                     |
| `undefined-var`  | `var(--x)` where `--x` is defined nowhere                                            |
| `raw-color`      | hex / `rgb(a)` / `hsl(a)` in **any** string literal (see below)                      |
| `palette-class`  | Tailwind's default palette (`text-gray-500`, `bg-blue-600`, `text-white`)            |
| `fill-text-pair` | a solid fill with the wrong `text-on-*` (`bg-danger-fg text-on-brand`, `hover:` too) |

**What counts as a class string.** `className` / `class` values and every
argument of `cn()`, `clsx()`, `twMerge()`, `cva()`, `cx()`. Any other string
(a class map like `TONE = { warn: '…' }`, a `labelClassName="…"` prop) counts
when every token is class-shaped (no capitals or trailing punctuation outside
`[…]`) and at least one token has a utility prefix: a colour utility
(`bg-`, `text-`, `border-`, …), a palette class, or a Tailwind variant
(`hover:`, `md:`, `data-[…]:`). Whether the tokens compile does not matter, so
a map of dead tokens is still checked. Copy (`'Shift closed: text-only'`) and
storage keys (`'pumpos:pending-stock-count'`) are not class strings.

**Raw colours.** A hex, `rgb()`/`rgba()` or `hsl()`/`hsla()` in any string
literal in a `.ts`/`.tsx` source counts: classes, style props, constants
(`const C = { a: '#fff' }`), ternaries (`ok ? '#123' : '#456'`), SVG
attributes. Not counted: `url(#id)` references, and a hex inside copy (the
string has capitals outside the hex, as in `'Order #123'`). PDF documents
(`@react-pdf/renderer`, `pdfmake`) may use hex: they have no CSS variables.

**Fill/text pairs across strings.** A `className` / `cn()` value is expanded
into every class string it can produce: ternary branches inside a template
combined with its static parts, all args of one `cn()` call, and local `const`
strings and object maps it names. `${ok ? 'bg-brand' : 'bg-danger-fg'} text-on-brand`
and `cn(base, 'text-on-brand')` are both checked.

Plain CSS classes defined in `index.css` are allowed.

```sh
npm run test:classes -w @pump/ui          # run the check (CI runs it too)
npm run test:classes:update -w @pump/ui   # lower the allow-list after a fix
npm run test:classes:baseline -w @pump/ui # one-off full rebaseline (may raise)
```

Violations are recorded in `class-guard/allowlist.json` as
`rule → file → count`. The check fails when a file gains a violation, when a
file not on the list has one, and when a file has **fewer** than its entry.

Since #539 the list holds one documented exception and nothing else:
`theme/config.ts` keeps the canvas colour as literal hex (`THEME_COLORS`),
because the pre-paint script sets `<meta name="theme-color">` before any CSS
loads; `theme/tokens.test.ts` keeps it equal to `--bg-canvas`. The fill/text
pair rule has no entries. Any new entry needs the same: a reason in
`classGuard.test.ts` and a test that keeps the literal in step.

**Lowering an entry.** After fixing violations, run `test:classes:update` and
commit the rewritten `allowlist.json`. The command only ever lowers entries and
drops them at zero; it never raises or adds one, so a new violation has to be
fixed, not listed. If two PRs conflict in `allowlist.json`, take either side and
re-run the command on the merged branch.

**Rebaselining (one-off only).** `npm run test:classes:baseline -w @pump/ui`
rewrites `allowlist.json` from the current counts, so it can raise entries and
add files. It exists for a deliberate one-off reset (as after the wave-1 merge
in #517), reviewed file by file in its PR. Normal PRs never run it: they fix
new violations and use the lower-only `test:classes:update`.

## Load order (apps must follow this)

```ts
// apps/*/src/main.tsx
import '@pump/ui/src/index.css'; // 1. raw --* variables + the few plain classes (drawer, field, print)
import '@pump/ui/src/pump-ds/tailwind.css'; // 2. Tailwind + @theme bridge over the raw variables
```

Reversing the order breaks the theme bridge — Tailwind's `@theme` block
references CSS variables that must already exist on `:root`.

## Folder shape

```
pump-ds/
  index.ts         — barrel export
  tailwind.css     — Tailwind entry + token bridge (do not edit lightly)
  README.md        — this file
  _smoke/          — verification component that proves the stack is wired
  <primitive>/     — one folder per primitive: <Primitive>.tsx (+ optional .css)
```
