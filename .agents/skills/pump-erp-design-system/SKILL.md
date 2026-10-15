---
name: pump-erp-design-system
description: Apply the Pump ERP product design system when designing, implementing, reviewing, or refining UI for desktop, web, reports, dashboards, forms, tables, and lifecycle UX. Use for any Pump ERP frontend or UX task that should stay compact, light-first, operator-friendly, and consistent with the long-term design spec.
---

# Pump ERP Design System

Use this skill for any Pump ERP UI or UX task.

## Required First Step

Read:

- `docs/PUMP-ERP-DESIGN-SYSTEM.md`

Treat that file as the source of truth.

## Product Direction

Pump ERP uses a **Calm Industrial Precision** design language.

Optimize for:

- familiarity
- compactness
- operator speed
- status clarity
- desktop-first workflows
- light mode first

Do not optimize for:

- flashy SaaS aesthetics
- oversized cards or buttons
- decorative motion
- generic purple-gradient enterprise UI

## Priority Order

1. Operator task speed
2. Accuracy and confidence
3. Compact dense layouts
4. Manager and owner visibility
5. Brand polish

If there is tension between beauty and speed, preserve speed.

## Core Rules

- Default to compact controls and compact spacing
- Keep primary actions obvious and secondary actions quiet
- Show state before decoration
- Prefer drawers over stacked modals
- Prefer tables and structured lists over card explosions
- Use light surfaces with restrained accent colors
- Make sync, offline, and shift states explicit
- Use SVG icons, never emojis
- Design for real data density, not empty mockup space

## Typography And Visual Defaults

- Primary font: `Plus Jakarta Sans`
- Numeric/data font: `Geist Mono`
- Default body size: `14px`
- Dense tables use `13px` (`InteractiveTable`, `GroupedTable`) or `12px` (`StatementTable`)
- **Nothing below `12px`.** Table headers (10px uppercase) are the only exception;
  field labels, hints, errors, group headings and captions are 12px
- Compact button heights: `28px`, `32px`, `36px`, `40px` (pump-ds `Button` sizes)

## Modules (UI identity, #515 / #539)

Build pages from these; the full catalog with props is in
`packages/ui/src/pump-ds/README.md` ("Modules"). Don't hand-roll what one decides.

- **Page Frame** (`PageFrame`): back link top-left (`back` slot, never top-right),
  title, one primary button top right, tabs, toolbar. On a tabbed page only the
  tab row sticks on scroll; title and actions scroll away (#604). Nothing else
  sticks.
- **Section header** (`SectionHeader`): the in-page heading; its `controls` put a
  `ControlBar` directly above the table it filters (layout B).
- **Controls**: `DateRangeMenu`, `FilterChips` (with counts), `SegmentedControl`
  (2–4 views), `Select` for 5+ options, `ExportMenu` and info tip at the right end.
  Filters apply instantly.
- **KPI tiles** (`KpiTile` with `scope`, `KpiStrip`, `TileSection`): at most 4,
  plain figures, colour only through `alert`, never repeating a table total
  (Reports excepted). Periods (#604): no label on a balance (`scope="now"`); a
  period every tile shares is named once on the strip (`KpiStrip scope`); a tile
  gets its own chip only when the strip mixes periods.
- **In-page edit forms** (Station details, Organization profile, station rules):
  no standing Save; `UnsavedChangesBar` ("Unsaved changes · Discard · Save",
  Save primary) shows only while the form is dirty, one per tab; React Hook Form +
  Zod; `useUnsavedChangesGuard` asks before leaving; other primaries demote (#604).
- **Overlays**: dialogs and the command palette blur the page (`--overlay-blur`)
  over the scrim; drawers keep a plain scrim. The sidebar collapses from its
  edge, its Collapse button, or ⌘\ / Ctrl+\ (#604).
- **Data Section** (`DataSection`): loading, refused, "Couldn't load … · Retry",
  empty, content. Never an empty state for a failed query.
- **Status vocabulary** (`StatusChip`, `VarianceChip`): every status word and tone
  from one map.
- **Table** (`InteractiveTable`, `GroupedTable`, `StatementTable`): one column
  definition; money totals in paise; stored totals with `derive: false`; custom
  total cells with `cells` + `texts`. A money table has a total row labelled with
  what it leaves out; a list shows "Total of N shown" only when filtered.
- **Statement** (`StatementView`, `buildLedgerStatement`): every ledger, screen
  and PDF from the same rows.
- **Tank gauge** (`TankGauge`) and **density display** (`DensityReading`): the
  station's thresholds and the shared density model; never a local threshold.
- **Office Record entry** (`OfficeRecordDrawer`): the one drawer for expense,
  income, collection, purchase and supplier payment.
- **Keyed save** (`useKeyedSave`, `sendKeyed`, `officeSubmitKeys`): every mutation
  sends an Idempotency-Key; `onSuccess` stays synchronous and invalidation runs in
  the background with central query keys.

Page rules (#515, KPI periods revised by #604): ledgers and balance lists use
layout B; reports use layout A (one bar under the tabs drives everything below). Red and amber only mean a
problem; ordinary money is plain. No raw `YYYY-MM-DD` dates on screen. A detail
line never repeats the line above it.

## Money, Quantity And Naming

Format through `@pump/ui` (`packages/ui/src/utils/format.ts`); never write a local money or quantity helper or a bare `toLocaleString`:

- Money: `formatMoney` / `inr` (`₹1,200.00`)
- Signed money: `formatSignedMoney` (`−₹1,200`, U+2212 before ₹); `signedMoneyParts` also returns the `sign` for a tone
- Quantity: `formatQuantity(value, unit)` (L 2 decimals, KL 1, density 1, counted units 0)
- Compact: `formatCompactMoney` (`₹38.5k`, `₹2.87L`, `₹2.5Cr`)
- Words: `MONEY_TERMS` (Receivable / Payable; one party: Owes you / You owe; Advance)

## Color Defaults

Use semantic tokens based on the design doc.

Default accent behavior:

- Petrol Green for primary action
- Diesel Blue for information
- Amber for warning and pending sync
- Red for destructive or critical states

Do not overuse accent color.

## Workflow For Any UI Task

### 1. Identify Context

Determine:

- user: operator, manager, owner
- surface: desktop, web, mobile-monitoring
- module: setup, shift, transaction, CRM, reporting, audit
- lifecycle stage: MVP, Pro, Enterprise

### 2. Pick The Right Layout Pattern

Default patterns:

- transactional work: app shell + focused work area + contextual drawer
- setup/admin: list or table + detail drawer
- reporting: filter bar + summary strip + table/chart area
- ownership review: summary-first, then drill-down

### 3. Preserve Density

Before finalizing any layout, check:

- can it fit realistic operational data?
- are buttons too large?
- are cards wasting space?
- is the hierarchy readable without large empty areas?

### 4. Design States

Always specify:

- loading
- empty
- error
- offline
- sync pending
- sync failed
- permission-restricted if relevant

### 5. Validate Against The Design System

Before delivering, verify:

- compact and readable
- state-forward
- primary action is obvious
- dark mode remains possible through semantic tokens
- keyboard and accessibility basics are covered

## Implementation Guidance

- Reuse shared tokens and component variants instead of creating one-off styles
- No raw hex/rgba in app code: the style check (`npm run test:classes -w @pump/ui`)
  fails on it. Shadows and scrims are tokens too (`shadow-(--shadow-popover)`,
  `bg-(--overlay-scrim)`)
- No legacy CSS classes: `.btn-*`, `.card*`, `.badge-*`, `.form-*` are gone; use
  pump-ds `Button`, token classes and `Field`
- Check dark with the dev switch `?theme=dark` (dark stays hidden behind
  `APPEARANCE_ENABLED = false`)
- Keep operator screens tighter than manager/owner screens
- Reports should look export-friendly and print-friendly
- Audit screens should emphasize chronology and actor clarity

## When Reviewing Existing UI

Look for these common failures:

- oversized widgets
- shallow hierarchy
- too many colors
- weak status visibility
- decorative dashboards with low operational value
- table rows that waste vertical space
- modal-heavy flows
- dark-first styling in operator screens

## Expected Output Style

When asked to design or implement UI, produce:

- the chosen pattern
- the rationale tied to the design system
- the main layout decisions
- state handling expectations
- accessibility and density considerations

Keep the answer practical and implementation-oriented.
