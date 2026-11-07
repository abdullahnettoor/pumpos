---
version: alpha
name: PumpOS — Calm Industrial Precision
description: >-
  The PumpOS design system: compact, light-first, operator-focused UI for the
  desktop (Tauri) and web console. This file is the single design source of
  truth. Every colour, type, radius and spacing token below mirrors
  packages/ui/src/index.css (or the pump-ds component that owns it), and
  scripts/check-design-tokens.mjs fails `npm run lint` when they drift. The
  component catalogue is packages/ui/src/pump-ds/README.md.
colors:
  primary: '#1F6A53'
  secondary: '#2E5E88'
  tertiary: '#B7811E'
  error: '#B44A3F'
  neutral: '#F6F7F4'
  surface: '#FFFFFF'
  surface-alt: '#F1F3EF'
  border-soft: '#D9DED6'
  border-strong: '#B9C1B7'
  on-surface: '#18201A'
  text-default: '#2B342D'
  text-muted: '#5E6A61'
  text-faint: '#7A857C'
  on-primary: '#FFFFFF'
  success-bg: '#E8F4EE'
  success-fg: '#1E6A4E'
  warning-bg: '#F9F0DA'
  warning-fg: '#8A6116'
  danger-bg: '#F8E3E0'
  danger-fg: '#9F3F36'
  info-bg: '#E8F0F7'
  info-fg: '#2E5E88'
  on-danger: '#FFFFFF'
  on-warning: '#FFFFFF'
  on-success: '#FFFFFF'
  on-info: '#FFFFFF'
  on-neutral: '#FFFFFF'
  dark-primary: '#2FD18D'
  dark-secondary: '#6CB6FF'
  dark-tertiary: '#F2B544'
  dark-error: '#FF7A6B'
  dark-neutral: '#0B0F0D'
  dark-surface: '#121815'
  dark-surface-alt: '#161D1A'
  dark-border-soft: '#1F2925'
  dark-border-strong: '#2A3530'
  dark-on-surface: '#FFFFFF'
  dark-text-default: '#CFD8D2'
  dark-text-muted: '#8A9A91'
  dark-text-faint: '#5D6C64'
  dark-on-primary: '#06110C'
  dark-success-bg: '#10241B'
  dark-success-fg: '#2FD18D'
  dark-warning-bg: '#221A10'
  dark-warning-fg: '#F2B544'
  dark-danger-bg: '#241514'
  dark-danger-fg: '#FF7A6B'
  dark-info-bg: '#12263A'
  dark-info-fg: '#6CB6FF'
  dark-on-danger: '#06110C'
  dark-on-warning: '#06110C'
  dark-on-success: '#06110C'
  dark-on-info: '#06110C'
  dark-on-neutral: '#06110C'
typography:
  page-title:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  drawer-title:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: 600
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: 400
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: 600
  field-label:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: 600
  caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: 400
  chip:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: 500
  section-label:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: 600
    letterSpacing: 0.025em
  table-header:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: 500
    letterSpacing: 0.04em
  data-md:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: 400
    fontFeature: '"tnum" 1'
  data-dense:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: 400
    fontFeature: '"tnum" 1'
  kpi-figure:
    fontFamily: Geist Mono
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: -0.01em
  amount-input:
    fontFamily: Geist Mono
    fontSize: 20px
    fontWeight: 500
    fontFeature: '"tnum" 1'
  kpi-figure-lg:
    fontFamily: Geist Mono
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: -0.01em
  mobile-hero-figure:
    fontFamily: Geist Mono
    fontSize: 30px
    fontWeight: 500
    lineHeight: 1.42857
    letterSpacing: -0.03em
    fontFeature: '"tnum" 1'
  mobile-page-title:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: -0.03em
rounded:
  input: 8px
  button: 8px
  card: 10px
  drawer: 12px
  chip: 999px
  tooltip: 6px
spacing:
  space-1: 4px
  space-2: 8px
  space-3: 12px
  space-4: 16px
  space-5: 20px
  space-6: 24px
  space-8: 32px
  space-10: 40px
  top-bar: 48px
  status-bar: 26px
  rail-expanded: 220px
  rail-collapsed: 60px
  page-padding: 24px
  drawer: 460px
  drawer-wide: 620px
  drawer-xwide: 920px
  dialog: 420px
  timeline-popover: 224px
components:
  app-canvas:
    backgroundColor: '{colors.neutral}'
    textColor: '{colors.text-default}'
    typography: '{typography.body-md}'
    padding: '{spacing.page-padding}'
  top-bar:
    backgroundColor: '{colors.surface}'
    height: '{spacing.top-bar}'
  nav-rail:
    backgroundColor: '{colors.surface-alt}'
    typography: '{typography.body-sm}'
    width: '{spacing.rail-expanded}'
  status-bar:
    backgroundColor: '{colors.surface-alt}'
    textColor: '{colors.text-muted}'
    typography: '{typography.caption}'
    height: '{spacing.status-bar}'
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.label-md}'
    rounded: '{rounded.button}'
    height: 36px
    padding: 16px
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    typography: '{typography.label-md}'
    rounded: '{rounded.button}'
    height: 36px
    padding: 16px
  button-danger:
    backgroundColor: '{colors.danger-fg}'
    textColor: '{colors.on-danger}'
    rounded: '{rounded.button}'
  button-sm:
    height: 32px
    padding: 12px
  button-lg:
    height: 40px
    padding: 20px
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    typography: '{typography.body-sm}'
    rounded: '{rounded.input}'
    height: 36px
    padding: 12px
  input-disabled:
    backgroundColor: '{colors.surface-alt}'
    textColor: '{colors.text-muted}'
  field-label:
    textColor: '{colors.text-muted}'
    typography: '{typography.field-label}'
  panel:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.card}'
    padding: 16px
  kpi-tile:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    typography: '{typography.kpi-figure}'
    padding: 14px
  table-header:
    textColor: '{colors.text-faint}'
    typography: '{typography.table-header}'
  table-row:
    textColor: '{colors.text-default}'
    typography: '{typography.body-sm}'
    padding: 12px
  table-cell-numeric:
    typography: '{typography.data-md}'
  chip:
    backgroundColor: '{colors.surface-alt}'
    textColor: '{colors.text-muted}'
    typography: '{typography.chip}'
    rounded: '{rounded.chip}'
    height: 22px
  chip-success:
    backgroundColor: '{colors.success-bg}'
    textColor: '{colors.success-fg}'
  chip-warning:
    backgroundColor: '{colors.warning-bg}'
    textColor: '{colors.warning-fg}'
  chip-danger:
    backgroundColor: '{colors.danger-bg}'
    textColor: '{colors.danger-fg}'
  chip-info:
    backgroundColor: '{colors.info-bg}'
    textColor: '{colors.info-fg}'
  drawer:
    backgroundColor: '{colors.surface}'
    width: '{spacing.drawer}'
    padding: 24px
  dialog:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.card}'
    width: '{spacing.dialog}'
    padding: 20px
  tooltip:
    backgroundColor: '{colors.on-surface}'
    textColor: '{colors.on-neutral}'
    rounded: '{rounded.tooltip}'
---

# PumpOS Design System

## Overview

PumpOS speaks **Calm Industrial Precision**. It is an operational instrument
for Indian fuel stations: not a POS, not a marketing site, not a traditional ERP.

- **Industrial:** grounded, practical, durable, operator-friendly.
- **Calm:** light surfaces, controlled contrast, low visual noise.
- **Precise:** strong alignment, crisp hierarchy, exact states, disciplined spacing.

Voice is precise, practical and confident; never casual, never luxury
marketing. Plain words over jargon ("Sync failed", not "transport error").

The primary user is the station operator on the desktop app and the web
console; managers and owners come second. Priority order: operator task speed,
accuracy and confidence, station visibility, owner oversight, brand polish.
When a choice slows the operator, speed wins. Premium comes from restraint.
References: Linear, Notion, Stripe Dashboard. Anti-references: SAP, Tally,
purple-gradient SaaS, glassmorphism, dark-first dashboards.

Principles:

1. **Shift-centric.** Station, business day, shift, sync state and exceptions
   are always one glance away (top bar and status bar).
2. **Dense, not busy.** Compact controls, tight tables, short labels, strong grouping.
3. **One primary action per page.** Everything else is secondary, ghost or in a menu.
4. **Status before chrome.** Open/closed, synced/failed, variance and
   paid/overdue show in headers, rows and drawers.
5. **Progressive disclosure.** Drawers, collapsible panels and tabs; never modal stacks.
6. **Keyboard-first.** Visible focus, predictable tab order, ⌘K command
   palette, ⌘\ / Ctrl+\ toggles the sidebar.

Scope and sources:

- Tokens are mirrors of `packages/ui/src/index.css` (raw `--*` variables),
  bridged into Tailwind by `packages/ui/src/pump-ds/tailwind.css`. Change a
  value there first, then here; `npm run lint` fails until both agree.
- Primitives and their contracts: `packages/ui/src/pump-ds/README.md`. The
  in-app gallery is the Design System screen (`components/DesignSystem.tsx`).
- The mobile app (`apps/mobile`) has its own "Control room" token set in
  `apps/mobile/src/theme/tokens.css`; its light colours reuse the values below
  (`tokens.test.ts` reads this file). The 12px minimum applies there too
  (`apps/mobile/src/minText.test.ts`), as does the type scale below plus its
  `mobile-` keys; the rest of this document targets
  desktop and web.

## Colors

A mostly neutral light theme with four fuel-retail accents. Accent signals
importance; it never paints a screen.

- **Petrol Green (#1F6A53) — `primary` (`--brand-primary`, `bg-brand`):** the
  one primary action, active tab underline, focus ring, selected state.
- **Diesel Blue (#2E5E88) — `secondary` (`--brand-secondary`):** information
  and neutral emphasis (info chips, "Syncing").
- **Signal Amber (#B7811E) — `tertiary` (`--brand-warning`):** a warning that
  needs attention (variance, low stock, expiring subscription).
- **Alert Red (#B44A3F) — `error` (`--brand-danger`):** failure, invalid input,
  destructive confirmation, critical exception.
- **Canvas (#F6F7F4) — `neutral` (`bg-canvas`):** the app background. Content
  sits on **Surface (#FFFFFF)**; recessed or grouped areas, the nav rail and
  the status bar use **Surface Alt (#F1F3EF)**.
- **Borders:** Border Soft (#D9DED6) separates panels and rows; Border Strong
  (#B9C1B7) outlines inputs and secondary buttons.
- **Text ramp:** Strong (#18201A, `text-ink-strong`) for titles and figures;
  Default (#2B342D) for body; Muted (#5E6A61) for labels and metadata; Faint
  (#7A857C) for hints, placeholders, table headers and disabled text only.
- **State pairs** (`--state-*-bg` / `--state-*-fg`): success, warning, danger,
  info. Use the pair together: tinted background, darker foreground.
- **On-fill text** (`--text-on-*`): a solid fill names its own text colour —
  `bg-brand` + `text-on-brand`, `bg-danger-fg` + `text-on-danger`,
  `bg-warning-fg` + `text-on-warning`, `bg-success-fg` + `text-on-success`,
  `bg-info-fg` + `text-on-info`, `bg-ink-strong` + `text-on-neutral`. Each
  pair holds ≥ 4.5:1 in both themes (`theme/tokens.test.ts`), and the class
  guard's `fill-text-pair` rule enforces it.

Tone rules:

- **Red and amber mean a problem, and only a problem.** Ordinary money,
  balances and figures are plain ink, even when negative or owed. A KPI tile
  turns tonal only through its `alert` prop.
- A write in flight ("Saving…", later "Waiting to sync") is neutral. Only a
  failed or refused write takes a problem tone.
- Never use Tailwind's default palette (`emerald-*`, `gray-*`, `text-white`)
  or a raw hex/`rgb()` in product code; the token classes are listed in
  `pump-ds/tailwind.css` (`bg-surface`, `text-ink-muted`, `bg-danger-bg`, …).

**Dark theme.** Built but hidden (`APPEARANCE_ENABLED = false` in
`theme/config.ts`; preview with `?theme=dark` in dev). The `dark-*` tokens are
the `:root.dark` values: near-black green surfaces, Mint (#2FD18D) primary and
near-black (#06110C) text on every solid fill. Dark is a screen theme only;
print and PDF keep the light ink. Components never branch on theme: they use
semantic tokens and the swap happens in `index.css`.

## Typography

- **Plus Jakarta Sans** (`font-sans`) is the UI font: familiar, compact, with
  more character than system UI or Inter. Weights 400/500/600/700 ship.
- **Geist Mono** (`font-mono`) is the data font. Weights 400/500 ship.
- Both are self-hosted (`/fonts`) so the desktop shell renders offline.

| Token                | Size / weight                | Where                                                                          |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `page-title`         | 18 / 600, -0.01em            | `PageHeader` h1 (one per page)                                                 |
| `drawer-title`       | 15 / 600                     | Drawer and dialog titles                                                       |
| `body-md`            | 14 / 400, 20px line          | `body` default, toasts                                                         |
| `body-sm`            | 13 / 400                     | Inputs, table rows, tabs, nav items, messages                                  |
| `label-md`           | 13 / 600                     | Buttons (`md`; `xs`/`sm` are 12px, `lg` 14px)                                  |
| `field-label`        | 12 / 600, muted              | `Field` / `.field-label`                                                       |
| `caption`            | 12 / 400                     | Hints, errors, status bar, subtitles, counts, kbd hints                        |
| `chip`               | 12 / 500                     | `Chip` / `StatusChip` (sentence case)                                          |
| `section-label`      | 12 / 600, uppercase          | `SectionHeader` and `Panel` titles                                             |
| `table-header`       | 10 / 500, uppercase          | Table column headers, faint ink                                                |
| `data-md`            | mono 13 / 400, tnum          | Money and quantity cells in `InteractiveTable`/`GroupedTable`                  |
| `data-dense`         | mono 12 / 400, tnum          | `StatementTable` (screen and print)                                            |
| `kpi-figure`         | mono 20 / 500 (18/24 sm/lg)  | `KpiTile` value                                                                |
| `amount-input`       | mono 20 / 500, tnum          | The ₹ amount of an Office Record drawer                                        |
| `kpi-figure-lg`      | mono 24 / 500                | `KpiTile` value at `size="lg"`                                                 |
| `mobile-hero-figure` | mono 30 / 500, -0.03em, tnum | **Mobile only.** Headline figure: `SalesHeadline`, `HeroCard`, wide `StatTile` |
| `mobile-page-title`  | 22 / 800, -0.03em            | **Mobile only.** `PageHeader` h1 in `apps/mobile`                              |

**Mobile-only type.** Keys prefixed `mobile-` belong to `apps/mobile` and are
not part of the desktop scale: the class guard's `off-scale-text` rule still
rejects `text-[22px]` and `text-[30px]` in `packages/ui`, while the mobile
guard (`apps/mobile/src/minText.test.ts`) accepts them. `check-design-tokens`
ties each to the mobile component that sets it.

Rules:

- **Nothing on screen is below 12px.** The only exception is the 10px
  uppercase table header (`table/columns.tsx` `HEADER`, which `DataTable`
  also uses). The class guard's `small-text`
  rule enforces it; write `text-[12px]` for captions, chips and counts.
  Mobile follows the same minimum (`text-xs`); its one exception is the
  alerts-bell badge count, marked `min-text exception` in code.
- Use the scale above; a size outside it needs a reason.
- **Mono for figures, sans for words.** Money, litres, meter readings,
  variance and counts are mono with tabular digits, right-aligned in tables at
  regular weight. Only a total row is semibold, and its mono figures stay at 500 (no 600 face ships). Dates are sans with tabular digits.
- Sentence case for labels, buttons, tabs, chips and navigation. Uppercase
  only for section labels, table headers and tiny metadata.
- Format through `@pump/ui` `utils/format.ts`, never a local helper or bare
  `toLocaleString`: `formatMoney` / `inr` (`₹1,200.00`), `formatSignedMoney`
  (`−₹1,200`, U+2212), `formatQuantity(value, unit)` (L 2 decimals, KL 1,
  meter readings 3), `formatCompactMoney` (`₹2.87L`), `formatDate`,
  `formatCalendarRange` (`1–15 Oct 2026`). Words for balances come from
  `MONEY_TERMS` (Receivable / Payable, Owes you / You owe, Advance).
- No raw `YYYY-MM-DD` on screen. Always show units.

## Layout & Spacing

A **4px grid** (`--space-1…10`: 4, 8, 12, 16, 20, 24, 32, 40). Components use
Tailwind's default spacing scale (`p-3` = 12px), which sits on the same grid.
Default density is compact.

Shell (`AppShell`):

- **Top bar** 48px (`TopBar`): brand, station switcher, business day /
  shift context, ⌘K search, + New, notifications, user.
- **Nav rail** 220px, collapsing to a 60px icon rail (and automatically on a
  narrow window), on Surface Alt. One navigation system only.
- **Content** on Canvas with 24px padding on every side.
- **Status bar** 26px (`StatusBar`, `--status-bar-height`): sync state,
  connectivity, app version and update chip. Toasts sit just above it (`--toast-offset`).
- **Drawer** on the right: 460px default, 620px `wide`, 920px `xwide`
  (editor beside a preview), or an exact `width` capped to the window.

Page anatomy (`PageFrame`), top to bottom:

1. Optional `BackLink`, top-left (never top-right).
2. Title + optional subtitle on the left; actions on the right, at most one primary.
3. `Tabs` for sections of the page (one level, never nested).
4. Toolbar / control bar.
5. Content, starting 16px below.

On a tabbed page only the tab row sticks on scroll; title and actions scroll
away. A page without tabs has nothing sticky. A sidebar page takes the
sidebar label as its title.

Content width: transactional pages, ledgers and reports are fluid; setup
and detail forms keep a readable column (about 720–960px).

## Elevation & Depth

Hierarchy comes from **tonal layers and borders**, not shadows. Panels,
tables and tiles are flat: Surface on Canvas with a Border Soft edge. Shadows
belong only to layers that float, one token per layer (deeper in dark):

| Token              | Layer                                 |
| ------------------ | ------------------------------------- |
| `--shadow-popover` | Menus, popovers, date pickers, toasts |
| `--shadow-dialog`  | Confirm dialog, command palette       |
| `--shadow-tooltip` | Tooltips                              |
| `--shadow-drawer`  | Right drawer, overlay nav rail        |
| `--shadow-control` | Switch thumb                          |

Use them as `shadow-(--shadow-popover)`. Scrims: dialogs and the command
palette dim with `--overlay-scrim` plus a 4px `--overlay-blur` (off under
`prefers-reduced-transparency`); a drawer uses the lighter `--overlay-drawer`
with no blur so the page beside it stays readable. Focus halos on inputs are
`--focus-ring` / `--focus-ring-danger`; every other control gets a 2px Petrol
Green outline offset 2px.

## Shapes

Compact and controlled, never toy-like. Radii are tokens (`rounded-*`):

- Buttons and inputs: 8px (`rounded-button`, `rounded-input`).
- Panels, tables, menus, toasts, dialogs: 10px (`rounded-card`).
- Command palette: 12px (`rounded-drawer`). Drawers themselves dock to the
  window edge with square corners.
- Chips, counts and pills: fully round (`rounded-chip`).
- Tooltips: 6px (`rounded-tooltip`).

Nothing softer than 12px on a container, and no mixing of sharp and rounded
containers in one view.

## Components

Primitives live in `packages/ui/src/pump-ds/` (barrel: `pump-ds/index.ts`);
a few app-aware modules sit beside them in `packages/ui/src/components`. Reach
for these before writing markup; the README has props and rules. Every
interactive primitive ships default, hover, focus-visible, active, disabled
and loading states, honours `prefers-reduced-motion`, and is keyboard-reachable.

- **`Button`** — variants `primary`, `secondary`, `outline`, `ghost`,
  `danger`; sizes `xs` 28, `sm` 32, `md` 36 (default), `lg` 40px; `iconOnly`
  squares it (and needs an `aria-label`). `loading` keeps the width and shows
  a spinner. No 44px+ buttons on desktop.
- **Inputs** — `Input`, `SearchInput`, `Select` (36px, `sm` 28px), `Combobox`,
  `Checkbox` / `Switch` (`Toggle.tsx`), all wrapped by **`Field`** for the
  label (neutral `*` when required), hint and inline error. Units and ₹ sit
  inside the control; numeric inputs are right-aligned mono. Forms are React
  Hook Form + Zod.
- **`UnsavedChangesBar`** — in-page edit forms have no standing Save: the
  bar shows "Unsaved changes · Discard · Save" only while dirty (one per tab,
  `UnsavedSectionsProvider`), and `useUnsavedChangesGuard` asks before leaving.
- **Tables** — `InteractiveTable` (sort, select), `GroupedTable` (rows under
  group headers), `StatementTable` (compact, read-only, print). One
  `TableColumn<T>[]`, whose `kind` (`money`, `qty`, `date`, `text`, `status`)
  sets alignment and font. Money tables carry a total row.
- **`StatementView`** — every ledger (customer, supplier, cash, bank, cash
  book account), screen and PDF from the same `buildLedgerStatement` rows.
- **`Panel`** — the bordered card for a group of content; collapsible.
- **KPI** — `KpiTile` in a `KpiStrip` / `TileSection`; at most four tiles,
  plain figures, period named once (see Page Patterns).
- **Status** — `StatusChip` (words, icons and tones from `STATUS_MAP`),
  `VarianceChip` (one balanced rule), `Chip` (soft / outline / solid, 12px,
  sentence case). Colour always comes with text.
- **`DataSection`** — loading skeleton, refused, "Couldn't load … · Retry",
  empty, content. A failed query never renders as empty.
- **`EmptyState`** — short and actionable: what the area is for, why it is
  empty, what to do next. No illustrations.
- **Overlays** — `Drawer` (create, edit, detail), `OfficeRecordDrawer` (the
  one drawer for expense, income, collection, purchase, supplier payment),
  `useConfirm` dialog, `Menu`, `Tooltip` / `InfoTip` (one `TooltipProvider`
  per app), `CommandPalette`, toasts (`ToastProvider`), `Banner`.
- **Controls** — `ControlBar`, `DateRangeMenu`, `DatePickerButton`,
  `FilterChips`, `SegmentedControl`, `Tabs`, `ExportMenu`.
- **Domain displays** — `TankGauge`, `DensityReading`, `MeterRow`,
  `Sparkline`, `Delta`, `BusinessDayChip`, `SyncPulse`.
- **Feedback** — inline validation; toast for success; `Banner` for a
  multi-step warning; the status bar for sync and connectivity. Confirm only
  destructive, shift close/reopen and irreversible lock/archive actions.
- **Motion** — 100–200ms colour transitions, a 200ms drawer slide, a 150ms
  first-load fade, a pulse only for live sync. Nothing bounces or shimmers.
- **Icons** — Lucide SVG through `Icon`. No emojis in product UI.

## Page Patterns

- **Controls order** (one `ControlBar`): date (`DateRangeMenu`, or
  `DatePickerButton` for a single day), search, `FilterChips`,
  `SegmentedControl`, then `ExportMenu` and the info tip at the right end.
  Filters apply instantly; there is no Apply button.
- **Chips vs dropdowns.** `FilterChips` (with counts) filter rows;
  `SegmentedControl` switches 2–4 views of the same data; a `Select` takes
  5+ options; `Tabs` are sections of a page, not filters.
- **Layout A (reports):** one control bar under the tabs drives everything below.
- **Layout B (ledgers, balance lists):** a `SectionHeader` with `controls`
  sits directly above the table it filters.
- **KPI periods.** A balance (`scope="now"`) is never labelled. When every
  tile shares a period the strip names it once (`KpiStrip scope`), except
  under a range control, which already names it. Never the words "In range":
  state the range. A ledger's tile never repeats its table's total (Reports may).
- **Editing.** List → Drawer → Edit. Settings-style pages edit in place
  behind `UnsavedChangesBar`; while it is dirty the page's other primary
  demotes to secondary.
- **Detail lines** never repeat the line above them.
- **Sync vocabulary:** Synced, Syncing, Offline, Sync failed. Failures are
  actionable; offline is explicit, never hidden.
- **Reports** read print-ready: clean filters, readable tables, compact
  summaries, export-safe spacing (`.print-area`, `.no-print`).

## Do's and Don'ts

- Do use Petrol Green for the single most important action or active state on a page.
- Do reuse a pump-ds primitive before writing markup; extend it rather than fork it.
- Do use mono tabular digits for every operational figure and right-align them in tables.
- Do keep variance visible (expected vs actual vs variance) instead of hiding it in a total.
- Do pair every status colour with words, and keep 4.5:1 text contrast.
- Do label every icon-only button (`scripts/check-icon-button-labels.mjs`).
- Do run `npm run test:classes -w @pump/ui` after UI changes.
- Don't use red or amber for anything that is not a problem.
- Don't write raw hex, `rgb()`, Tailwind palette colours, default `rounded-lg`
  / `shadow-lg`, or text under 12px; use the tokens.
- Don't use inline `style` except for a value known only at run time
  (popover coordinates, a gauge fill, a column count).
- Don't stack modals or open a dialog for create/edit; use a drawer.
- Don't build oversized cards, giant empty gutters or 44px+ desktop buttons.
- Don't literalize fuel imagery (hoses, pumps, droplets) as decoration.
- Don't use technical jargon (queue flush, transport error) in primary UI.
