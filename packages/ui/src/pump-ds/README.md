# pump-ds

The canonical PumpOS design system. Every new primitive built as part of the
UI revamp lives under this folder. Old primitives in
`packages/ui/src/components/` are the legacy surface and are replaced one at
a time — never in place.

## Rules of the road

1. **Single source of truth for tokens** stays `packages/ui/src/index.css`.
   `pump-ds/tailwind.css` only mirrors those `--*` variables into Tailwind's
   `@theme` namespace. Change a raw value in one place; both the legacy CSS
   classes and the Tailwind utilities pick it up.

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
- **Sorting** puts empty and broken values last in either direction.
- **PDF.** `cellText` and `totalTexts` read a cell and the total row as plain
  text, for a PDF that prints the screen's table (the DSR, #580). A column whose
  `cell` changes the words or figures sets `text` too, so both print the same.

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

Today's violations are recorded in `class-guard/allowlist.json` as
`rule → file → count`. The check fails when a file gains a violation, when a
file not on the list has one, and when a file has **fewer** than its entry.

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
import '@pump/ui/src/index.css'; // 1. raw --* variables + legacy classes
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
