---
version: alpha
name: PumpOS — Calm Industrial Precision
description: >-
  Design system for PumpOS, the operating system for fuel retail. Compact,
  light-first, operator-focused UI for desktop and web. Raw token values live in
  packages/ui/src/index.css and are mirrored into Tailwind by
  packages/ui/src/pump-ds/tailwind.css. Full spec: docs/PUMP-ERP-DESIGN-SYSTEM.md.
colors:
  primary: "#1F6A53"
  secondary: "#2E5E88"
  tertiary: "#B7811E"
  error: "#B44A3F"
  neutral: "#F6F7F4"
  on-primary: "#FFFFFF"
  surface: "#FFFFFF"
  surface-alt: "#F1F3EF"
  border-soft: "#D9DED6"
  border-strong: "#B9C1B7"
  on-surface: "#18201A"
  text-default: "#2B342D"
  text-muted: "#5E6A61"
  text-faint: "#7A857C"
  success-bg: "#E8F4EE"
  success-fg: "#1E6A4E"
  warning-bg: "#F9F0DA"
  warning-fg: "#8A6116"
  danger-bg: "#F8E3E0"
  danger-fg: "#9F3F36"
  info-bg: "#E8F0F7"
  info-fg: "#2E5E88"
typography:
  headline-display:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: 600
    lineHeight: 34px
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: 600
    lineHeight: 30px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: 600
    lineHeight: 24px
  title:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: 600
    lineHeight: 22px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
  label-caps:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.04em
  data-md:
    fontFamily: Geist Mono
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    fontFeature: '"tnum" 1'
  data-dense:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    fontFeature: '"tnum" 1'
rounded:
  none: 0px
  sm: 8px
  md: 10px
  lg: 12px
  full: 999px
spacing:
  base: 4px
  space-1: 4px
  space-2: 8px
  space-3: 12px
  space-4: 16px
  space-5: 20px
  space-6: 24px
  space-8: 32px
  space-10: 40px
  space-12: 48px
  top-bar: 56px
  rail-expanded: 220px
  rail-collapsed: 72px
  drawer-narrow: 360px
  drawer-standard: 420px
  drawer-wide: 520px
  form-max: 960px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: 36px
    padding: 12px
  button-primary-sm:
    height: 30px
  button-primary-lg:
    height: 40px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: 36px
    padding: 12px
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    height: 36px
    padding: 12px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: 36px
    padding: 10px
  input-dense:
    height: 32px
  input-disabled:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text-faint}"
  app-canvas:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.text-default}"
  divider:
    backgroundColor: "{colors.border-soft}"
    height: 1px
  control-outline:
    backgroundColor: "{colors.border-strong}"
    height: 1px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-default}"
    rounded: "{rounded.md}"
    padding: 16px
  drawer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-default}"
    rounded: "{rounded.lg}"
    width: 420px
    padding: 20px
  top-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    height: 56px
  nav-rail:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text-muted}"
    width: 220px
  table-header:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.text-muted}"
    typography: "{typography.caption}"
    height: 32px
  table-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-default}"
    typography: "{typography.body-sm}"
    height: 36px
  table-cell-numeric:
    textColor: "{colors.on-surface}"
    typography: "{typography.data-dense}"
  chip-success:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success-fg}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 6px
  chip-warning:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning-fg}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 6px
  chip-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-fg}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 6px
  chip-info:
    backgroundColor: "{colors.info-bg}"
    textColor: "{colors.info-fg}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 6px
  kpi-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.data-md}"
    rounded: "{rounded.md}"
    padding: 16px
---

# PumpOS Design System

## Overview

PumpOS follows a **Calm Industrial Precision** design language. It is an
operational instrument for Indian fuel stations, not a POS, a marketing site or
a traditional ERP.

- **Industrial:** grounded, practical, durable, operator-friendly.
- **Calm:** light surfaces, controlled contrast, low visual noise.
- **Precise:** strong alignment, crisp hierarchy, exact states, disciplined spacing.

The primary user is the pump operator on desktop (Tauri) and web; secondary
users are station managers and owners. Priority order: operator task speed,
accuracy and confidence, station visibility, owner oversight, then brand
polish. If a decision conflicts with operator speed, operator speed wins.

The UI should feel familiar on first use, fast after one day, trustworthy under
pressure, and dense without being cramped. Premium comes from restraint.
Reference points: Linear, Notion, Stripe Dashboard. Anti-references: SAP, Tally,
purple-gradient SaaS, glassmorphism, dark-mode-first dashboards.

Experience principles:

1. **Shift-centric.** Active shift, business day, station, sync state and
   exceptions are always easy to find.
2. **Dense, not busy.** Compact controls, tight tables, short labels, strong grouping.
3. **One primary action per screen.** Open shift, record expense, close shift, review DSSR.
4. **Status before chrome.** Open/closed, synced/pending/failed, variance,
   paid/overdue are visible in headers, rows, summaries and drawers.
5. **Progressive disclosure.** Drawers, expandable sections, secondary tabs; no modal stacks.
6. **Keyboard-friendly.** Strong tab order, visible focus, predictable form flow.

## Colors

A mostly neutral light theme with a small set of fuel-retail accents. Accent
signals importance; it never paints the whole screen.

- **Petrol Green (#1F6A53) — `primary`:** primary CTAs and active emphasis.
- **Diesel Blue (#2E5E88) — `secondary`:** informational context and navigation emphasis.
- **Signal Amber (#B7811E) — `tertiary`:** warnings, pending sync, variance attention.
- **Alert Red (#B44A3F) — `error`:** failure, destructive actions, critical exceptions only.
- **Canvas (#F6F7F4) — `neutral`:** the app background. Content sits on
  **Surface (#FFFFFF)**; grouped or recessed areas use **Surface Alt (#F1F3EF)**.
- **Borders:** Border Soft (#D9DED6) separates; Border Strong (#B9C1B7) outlines controls.
- **Text:** Strong (#18201A) for headings and values, Default (#2B342D) for
  body, Muted (#5E6A61) for labels and metadata, Faint (#7A857C) for
  placeholders and disabled text only.
- **State pairs:** success, warning, danger and info each have a tinted
  background and a darker foreground. Always use the pair together.

Colors are semantic tokens (`--bg-*`, `--text-*`, `--border-*`, `--brand-*`,
`--state-*`). Never hardcode hex values or use Tailwind's default palette
(`emerald-*`, `sky-*`, …) in product code. Dark mode will be layered later by
swapping semantic values, not by reworking component anatomy.

## Typography

- **Plus Jakarta Sans** is the UI font: familiar, professional, compact, with
  more character than system/Inter.
- **Geist Mono** is the data font, with tabular numerals, for currency, pump
  readings, shift figures, stock and variance values.

Both are self-hosted so the desktop shell renders offline.

Rules:

- Default body size is 14px (`body-md`). Dense tables may use 12–13px.
- Never go below 12px; minimum running body text is 13px.
- Headings are semibold (600). Avoid more than two weights in one block.
- Sentence case for labels and navigation. Uppercase only for tiny metadata
  and status chips (`label-caps`).
- Currency uses the rupee symbol with Indian grouping (`₹ 12,450`); keep
  decimals only where meaningful. Always show units (L, kL, ₹).

## Layout

A compact **4px base grid** with 8px multiples for macro spacing
(4, 8, 12, 16, 20, 24, 32, 40, 48).

Shell:

- Left navigation rail — 220px expanded, 72px collapsed.
- Compact top status bar — 56px, carrying station, shift/business day, sync
  state and user/role.
- Central work canvas.
- Right-side contextual drawer for create/edit/detail — 360px narrow, 420px
  standard, 520px wide.

Only one navigation system. Transactional pages and reports are fluid width;
setup and detail forms sit at 720–960px. Sections follow title → optional
helper line → action row → content. Default density is compact; web manager
screens may breathe slightly more than operator screens.

## Elevation & Depth

Hierarchy comes from **tonal layers and borders**, not shadows. Canvas sits
behind white surfaces; Border Soft separates blocks.

- Level 0: none (default for cards, tables, panels).
- Level 1: subtle separator shadow for floating bars and drawers.
- Level 2: moderate shadow for overlays only (menus, command palette, popovers).

## Shapes

Compact and controlled, never toy-like.

- Buttons and inputs: 8px (`rounded.sm`).
- Cards: 10px (`rounded.md`).
- Drawers: 12px (`rounded.lg`).
- Chips and pills: fully rounded (`rounded.full`).

Do not go softer than this, and do not mix sharp and rounded containers in one view.

## Components

Primitives live in `packages/ui/src/pump-ds/`. Each ships default, hover,
focus-visible, active, disabled, loading and error states and honors
`prefers-reduced-motion`.

- **Buttons:** primary is filled Petrol Green; secondary is a surface with a
  visible border; destructive uses Alert Red only when required. Heights are
  30 / 36 / 40px. No 48px+ buttons in desktop flows. One primary per screen,
  top-right in management headers or inline in transactional flows.
- **Inputs:** 36px default, 32px dense. Units and prefixes live inside the
  control. Validation appears inline next to the field. Forms use React Hook
  Form + Zod.
- **Tables:** first-class. Dense rows, subtle separators before zebra
  stripes, sticky headers when needed, numeric columns right-aligned in mono,
  a dedicated actions column, and row state always exposed.
- **Cards:** summarize, never decorate. KPI summaries, grouped context,
  alerts, quick actions. No giant marketing tiles.
- **Drawers:** the default for create, edit and detail (List → Drawer →
  Edit). Preferred over modals because they preserve context.
- **Tabs:** only for stable top-level sections, never nested more than one level.
- **Chips/badges:** status, role, payment, sync and shift state. Color is
  always paired with text.
- **Empty states:** short and action-oriented: what the area is for, why it
  is empty, what to do next. No illustrations on operational screens.
- **Sync status:** persistently visible, in plain language: Synced, Syncing,
  Pending sync, Offline mode, Sync failed. Pending items are countable; failures are actionable.
- **Feedback:** inline validation, toast for success, banner for multi-step
  warnings, sticky rail for sync/offline issues. Confirm only destructive,
  shift close/reopen and irreversible lock/archive actions.
- **Motion:** 120–180ms hover/focus transitions, drawer slide, first-load
  section fade, pulse only for active sync.
- **Icons:** Lucide SVG. No emojis in product UI.

## Do's and Don'ts

- Do use Petrol Green only for the single most important action or active state on a screen.
- Do use mono tabular numerals for every operational value and right-align them.
- Do keep variance visible (expected vs actual vs variance) rather than hiding it in a total.
- Do pair every status color with a text label; never rely on color alone.
- Do keep visible keyboard focus and 4.5:1 text contrast minimum.
- Do label every icon-only button.
- Don't use oversized cards, giant empty gutters or 48px+ buttons.
- Don't stack modals; use a drawer.
- Don't use Tailwind default palette colors or one-off hex values.
- Don't literalize fuel imagery (hoses, pumps, droplets) as decoration.
- Don't add bouncing counters, constant shimmer or decorative animation.
- Don't use technical jargon (queue flush, transport error) in primary UI.
