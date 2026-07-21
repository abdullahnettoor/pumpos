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
- Dense tables may use `12px` to `13px`
- Compact button heights: `30px`, `36px`, `40px`

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
- Prefer semantic CSS variables or theme tokens over raw hex values in app code
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
