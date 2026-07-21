# Pump ERP Design System

## Purpose

This document is the production design spec for the Pump ERP application across:

- Desktop operator workflows
- Web management workflows
- Future owner-facing monitoring
- MVP, Pro, and Enterprise lifecycle evolution

It should be treated as the primary design source of truth for product, design, and frontend implementation.

This spec intentionally favors:

- Familiarity over novelty
- Speed over decoration
- Compactness over oversized UI
- Operational clarity over marketing-style layouts
- Light mode first, with a clean path to dark mode later

---

## Design Direction

### Chosen Direction

The product should follow a **Calm Industrial Precision** design language.

It fits a fuel pump ERP better than a flashy dashboard or luxury SaaS aesthetic because the product is used in real operations where speed, trust, and repeatability matter more than spectacle.

### What That Means

- Industrial: grounded, practical, durable, operator-friendly
- Calm: light surfaces, controlled contrast, low visual noise
- Precise: strong alignment, crisp information hierarchy, exact states, and disciplined spacing

### What It Should Feel Like

- Familiar on first use
- Fast after one day of use
- Trustworthy during pressure situations
- Dense enough for professionals, never cramped
- Premium through restraint, not loud visuals

### Avoid

- Oversized cards and giant empty layouts
- Toy-like rounded UI
- Purple-gradient SaaS styling
- Excessive glassmorphism
- Dashboard clutter
- Dark mode as the default aesthetic
- Decorative motion that slows work

---

## Product Priorities

### Primary User

Pump operators on desktop and web view.

### Secondary Users

- Station managers
- Owners reviewing performance and exceptions

### Design Priority Order

1. Operator task speed
2. Accuracy and confidence
3. Station-level operational visibility
4. Owner-level summary and oversight
5. Brand polish and delight

If a design decision conflicts with operator speed, operator speed wins.

---

## Experience Principles

### 1. Shift-Centric UI

The active shift is the heartbeat of the product. Core status must always be easy to find:

- Active shift state
- Station
- Sync state
- Cash context
- Exceptions requiring attention

### 2. Dense, Not Busy

The interface should fit meaningful operational data without feeling cramped.

Use:

- compact controls
- tighter tables
- disciplined spacing
- short labels
- strong grouping

Do not use huge buttons, giant hero cards, or oversized empty gutters.

### 3. Familiarity First

The UI should feel learnable to someone moving from spreadsheet-driven or traditional ERP workflows, but more modern and more readable.

### 4. One Primary Action Per Screen

Every screen needs one obvious primary task:

- open shift
- enter expense
- close shift
- create product
- review DSSR

Secondary actions should never overpower the main action.

### 5. Status Before Chrome

Operational states matter more than decoration.

Important status types:

- open / closed / locked
- synced / pending / failed / offline
- shortage / variance / warning
- paid / unpaid / overdue

These states should be immediately visible in headers, rows, summaries, and detail drawers.

### 6. Progressive Disclosure

Keep the first layer simple.

Expose advanced controls through:

- drawers
- expandable sections
- secondary tabs
- inline detail panels

Avoid multi-modal stacks.

### 7. Keyboard-Friendly Operations

This is an operator system, not a browsing-first product.

The design must support:

- strong tab order
- visible focus states
- compact forms
- predictable form flow
- future keyboard shortcuts and command actions

---

## Brand Character

### Voice

- precise
- practical
- modern
- confident
- not casual
- not luxury-marketing

### Visual Character

- clean light surfaces
- disciplined grid
- muted neutrals
- fuel-inspired accents used sparingly
- strong numeric presentation
- subtle industrial cues

### Signature Motif

Use a restrained “instrument panel” feel:

- compact header bars
- grouped metrics
- data-first cards
- subtle section dividers
- status rails and chips

Do not literalize fuel imagery with obvious icons, hoses, or illustrations.

---

## Surface Strategy

## Desktop Operator Surface

This is the main product surface.

Requirements:

- dense information
- low pointer travel
- compact forms
- visible context at all times
- stable layouts with minimal jumping

Recommended shell:

- left navigation rail
- compact top status bar
- central work canvas
- right-side contextual drawer for create/edit/detail flows

## Web Manager Surface

Use the same design language, with slightly more breathing room than operator views.

Best for:

- station setup
- customer/supplier administration
- reports
- owner review

## Mobile Future Surface

Monitoring-first, not operator-first.

Prioritize:

- dashboard
- DSSR
- alerts
- outstanding balances
- key reports

---

## Layout Rules

### Grid

Use a compact **4px base grid** with 8px multiples for macro spacing.

Token rhythm:

- 4
- 8
- 12
- 16
- 20
- 24
- 32
- 40
- 48

### Shell Dimensions

- top bar: `56px`
- left rail expanded: `220px`
- left rail collapsed: `72px`
- right drawer widths:
  - narrow: `360px`
  - standard: `420px`
  - wide detail: `520px`

### Content Width

- transactional pages: fluid width
- setup/detail forms: `720px` to `960px`
- reports: fluid with table-first layout

### Section Rhythm

Prefer clear vertical grouping over large visual blocks.

Use:

- section title
- short helper line only when needed
- action row
- content block

---

## Typography

### Font Pairing

Use:

- **Primary UI font:** `Plus Jakarta Sans`
- **Data/number font:** `Geist Mono`

Why:

- familiar and professional
- compact and readable
- excellent for dense admin UI
- more character than generic system/Inter styling

### Type Scale

- Display L: `28 / 34 / 600`
- Display M: `24 / 30 / 600`
- Heading L: `20 / 28 / 600`
- Heading M: `18 / 24 / 600`
- Heading S: `16 / 22 / 600`
- Body M: `14 / 20 / 400`
- Body S: `13 / 18 / 400`
- Caption: `12 / 16 / 500`
- Data Dense: `12 / 16 / 500`

### Typography Rules

- Default body size: `14px`
- Dense tables may use `12px` to `13px`
- Never drop below `12px`
- Use mono for currency blocks, pump readings, shift figures, and variance values
- Use sentence case for labels and navigation
- Use uppercase only for very small metadata or status chips

---

## Color System

### Philosophy

Use a mostly neutral light theme with a small set of fuel-retail-inspired accents.

Accent should signal importance, not paint the whole product.

### Core Palette

#### Neutrals

- Canvas: `#F6F7F4`
- Surface: `#FFFFFF`
- Surface Alt: `#F1F3EF`
- Border Soft: `#D9DED6`
- Border Strong: `#B9C1B7`
- Text Strong: `#18201A`
- Text Default: `#2B342D`
- Text Muted: `#5E6A61`
- Text Faint: `#7A857C`

#### Brand/Accent

- Petrol Green: `#1F6A53`
- Diesel Blue: `#2E5E88`
- Signal Amber: `#B7811E`
- Alert Red: `#B44A3F`

#### State Colors

- Success BG: `#E8F4EE`
- Success FG: `#1E6A4E`
- Warning BG: `#F9F0DA`
- Warning FG: `#8A6116`
- Danger BG: `#F8E3E0`
- Danger FG: `#9F3F36`
- Info BG: `#E8F0F7`
- Info FG: `#2E5E88`

### Usage Rules

- Use Petrol Green for primary CTAs and active emphasis
- Use Diesel Blue for informational contexts and navigation emphasis
- Use Amber for warnings, pending sync, and variance attention
- Use Red only for failure, destructive actions, and critical exceptions

Do not flood screens with accent colors.

### Dark Mode Extensibility

Define all colors as semantic tokens, not hardcoded values.

Required token groups:

- `bg.canvas`
- `bg.surface`
- `bg.surfaceAlt`
- `text.primary`
- `text.secondary`
- `text.muted`
- `border.soft`
- `border.strong`
- `state.success`
- `state.warning`
- `state.danger`
- `state.info`
- `brand.primary`
- `brand.secondary`

Dark mode can be introduced later by swapping semantic values without reworking component anatomy.

---

## Elevation, Radius, and Density

### Radius

- cards: `10px`
- inputs: `8px`
- buttons: `8px`
- chips: `999px`
- drawers: `12px`

This should feel compact and controlled, not overly soft.

### Borders

Prefer borders over heavy shadows.

### Shadow System

- level 0: none
- level 1: subtle separator shadow for floating bars/drawers
- level 2: moderate shadow for overlays only

### Density Modes

Default density should be **compact**.

Later extensibility:

- comfortable
- compact

Do not build the MVP around oversized spacing.

---

## Component Rules

## App Shell

Must include:

- station context
- current shift context
- sync state
- user identity and role
- environment-safe top actions

Navigation should be simple, grouped, and scannable.

## Buttons

Primary buttons:

- filled Petrol Green
- medium height
- compact horizontal padding

Secondary buttons:

- neutral surface
- visible border

Destructive buttons:

- red accent only when required

Button sizes:

- small: `30px`
- medium: `36px`
- large: `40px`

Do not use giant 48px+ buttons in standard desktop flows.

## Inputs

Inputs should feel fast and compact.

Rules:

- default height: `36px`
- dense height: `32px`
- helper text only when useful
- inline validation near the field
- units and prefixes built into the control where possible

## Tables

Tables are a first-class pattern.

Rules:

- sticky headers when needed
- zebra striping is optional; use subtle row separation first
- dense rows for operator lists
- right-align numeric data
- use mono numerals for values
- preserve a dedicated actions column
- always expose row state

## Cards

Cards should summarize, not decorate.

Use cards mainly for:

- KPI summaries
- grouped context blocks
- alerts
- quick actions

Avoid giant marketing-style dashboard tiles.

## Drawers

Use drawers for:

- create/edit flows
- record details
- secondary configuration

Drawers are preferred over stacked modals because they preserve context.

## Tabs

Use tabs only for stable high-level sections.

Do not nest tabs more than one level deep.

## Chips and Badges

Use chips for:

- status
- role
- payment state
- sync state
- shift state

Color must always be paired with text.

## Empty States

Empty states should be short, useful, and action-oriented.

Include:

- what this area is for
- why it is empty
- what action to take next

Avoid illustrations for operational screens.

---

## Interaction Patterns

### Primary Actions

Place the primary action consistently:

- top right of page header for management screens
- inline near the workflow block for transactional flows

### Confirmation Strategy

Use confirmation only for:

- destructive actions
- shift close
- shift reopen
- irreversible archive or lock actions

Do not ask for confirmation on every save.

### Feedback

Use:

- inline field validation
- toast for success
- banner for important multi-step warnings
- sticky status rail for sync/offline issues

### Motion

Motion should be minimal and purposeful.

Allowed:

- 120–180ms hover/focus transitions
- drawer slide
- section fade on first load
- status pulse only for active sync

Avoid:

- bouncing counters
- dashboard animation overload
- constant shimmer effects

Respect `prefers-reduced-motion`.

---

## Lifecycle UX Rules

## MVP

Goal:

- fast operator adoption
- low training cost
- clear shift and setup workflows

Design posture:

- fewer decisions on screen
- compact single-purpose forms
- obvious status blocks
- reports that prioritize trust over visual flourish

## Pro

Goal:

- deeper stock, finance, and customer visibility

Design posture:

- denser analytical surfaces
- smarter drill-down
- stronger comparative views
- richer exception handling

## Enterprise

Goal:

- multi-station coordination
- ownership oversight
- governance and controls

Design posture:

- layered navigation
- multi-station summary patterns
- role-aware dashboards
- audit and workflow visibility

The visual system should scale by adding hierarchy and density, not by changing style direction.

---

## Module-Level Guidance

## Authentication

- simple, trustworthy, and low-friction
- no oversized marketing login shell
- clear environment and station context if relevant
- strong error handling for auth and network failures

## Dashboard

For operators:

- active shift
- cash context
- pending work
- sync state
- recent issues

For owners/managers:

- station summary
- alerts
- today vs trend
- outstanding balances
- high-priority exceptions

## Station Setup & Onboarding

Station Setup is divided into two distinct lifecycle phases:

### 1. Guided Onboarding (First-Run UX)
- Designed as a linear multi-step progress wizard.
- Steps are sequential: Basics ➜ Products ➜ Tanks ➜ Dispensers ➜ Nozzles ➜ Shifts (optional).
- Emphasizes single-focus forms per step with clear instructions and validation checklist rules.
- Prevents skipping critical steps unless dependencies are resolved.

### 2. Station Overview (Post-Onboarding Rare-Edit UX)
- All separate setup route screens are collapsed into a single, consolidated Station Overview.
- Layout uses a clean tabbed panel (`var(--bg-surface)`) to switch between entity contexts.
- Editing actions open clean detail drawers or inline forms to preserve location context.
- High-level KPIs and readiness status are displayed at the top.

## Shift Management

This must be the strongest workflow in the product.

Requirements:

- shift status always visible
- clear before/after states
- strong validation summaries before close
- high confidence on lock/reopen actions

## Expenses, Purchases, Collections

Use fast-entry patterns:

- compact forms
- relevant defaults
- inline calculations if needed
- visible document references

## Inventory and Variance

Use denser layouts with:

- expected vs actual comparisons
- variance emphasis
- strong numeric formatting
- compact explanatory notes

## CRM

Balance familiarity with clarity.

Avoid sales-CRM styling.

Make it operational:

- balances
- credit limits
- last activity
- transaction trail

## Reports

Reports should look print-ready, not decorative.

Requirements:

- clean filters
- readable tables
- compact summaries
- export-safe spacing

## Audit

Audit surfaces should emphasize chronology, actor, and change clarity.

Use:

- timeline tables
- before/after blocks
- filterable event groups

---

## Offline and Sync UX

This product is offline-aware by design. Sync UX is not optional chrome.

### Rules

- sync status must be persistently visible
- offline mode should be explicit, not hidden
- pending items should be countable
- failed sync must be actionable
- the user must know whether work is safe

### Status Language

Use plain language:

- Synced
- Syncing
- Pending sync
- Offline mode
- Sync failed

Avoid technical jargon like queue flush, replication pending, or transport error in primary UI.

### Offline Warning Design

- warning after defined threshold
- stronger escalation for prolonged offline mode
- keep warning persistent but not blocking unless data safety is at risk

---

## Data Display Rules

### Numbers

- use mono numerals for all operational values
- align decimal-based values consistently
- show units explicitly
- avoid unnecessary decimals

### Currency

- use the rupee symbol consistently
- prefer `₹ 12,450` formatting
- keep decimals only where meaningful

### Dates and Time

Use consistent formats:

- short date for tables
- full timestamp for audit and event history
- shift time windows must be easy to compare

---

## Accessibility

This system must be efficient for long-duration work.

### Minimum Rules

- visible keyboard focus
- 4.5:1 text contrast minimum
- 44x44 touch targets only where touch is relevant; desktop actions may be visually smaller if focus and click areas remain usable
- all icon-only buttons need labels
- status cannot rely on color alone
- error messages must be human-readable

### Readability

- minimum body text: `13px`
- default body text: `14px`
- line length should remain controlled in forms and documentation blocks

---

## Performance and Implementation Guidance

### Frontend Expectations

- use semantic tokens, not one-off colors
- component variants must be explicit
- avoid hardcoded spacing drift
- table density and drawer patterns should be reusable
- empty/loading/error states should be built as system patterns

### Design Token Categories

- color
- typography
- spacing
- radius
- border
- shadow
- motion
- z-index
- density

### Iconography

Use a clean SVG icon system such as Lucide.

Do not use emojis in product UI.

---

## Governance Rules

Every new screen or major redesign should answer:

1. Who is the primary user?
2. What is the primary action?
3. What state is most important?
4. What can be hidden until needed?
5. Is the layout compact enough for operational use?
6. Does it remain calm and readable after real data fills it?

If the screen looks impressive but slows the operator, it fails the design system.

---

## Delivery Checklist

Before shipping any module, verify:

- compact layout is preserved
- status is visible without hunting
- actions are obvious
- table density is appropriate
- forms are short and sequential
- offline/sync behavior is legible
- empty/loading/error states exist
- keyboard focus is visible
- color tokens are semantic
- dark mode could be layered later without redesigning structure

---

## Final Standard

Pump ERP should compete on UI/UX not by looking like a generic SaaS product, but by becoming a **beautiful operational instrument**:

- compact
- fast
- confident
- modern
- durable across the application lifecycle

That is the standard this system should hold.
