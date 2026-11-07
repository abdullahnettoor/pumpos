---
name: pump-erp-design-system
description: PumpOS UI work. Use when building, changing or reviewing any screen, component, form, table, report or style in packages/ui or apps/*, so it follows DESIGN.md and reuses pump-ds.
---

# PumpOS design system

The design lives in two files, and the code in `packages/ui/src/index.css` and
`packages/ui/src/pump-ds/` outranks both:

- `DESIGN.md` (repo root): tokens, rules, page patterns, do's and don'ts.
- `packages/ui/src/pump-ds/README.md`: the module catalogue, table rules and the style check.

## Steps

1. **Read both files** before touching UI. Done when you can name the
   tokens, typography roles and pump-ds modules your change uses.
2. **Reuse first.** Find the module that already decides the thing
   (`PageFrame`, `SectionHeader`, `ControlBar`, `KpiTile`, `DataSection`,
   `StatusChip`, `InteractiveTable`/`StatementTable`, `Drawer`,
   `OfficeRecordDrawer`, `Field`, `Button`, …) and compose or extend it. A new
   primitive goes in `pump-ds/<name>/` with a domain name and every state
   (default, hover, focus-visible, active, disabled, loading, error).
3. **Tokens only.** Colours through token classes (`bg-surface`,
   `text-ink-muted`, `bg-danger-bg`) or `var(--…)`; sizes from the DESIGN.md
   type scale; radii `rounded-button|input|card|chip`; shadows
   `shadow-(--shadow-*)`. Raw hex, Tailwind palette colours and off-scale
   sizes stay out.
4. **Every state.** Loading, empty, failed and refused through `DataSection`;
   offline and sync wording from the status vocabulary; check dark with
   `?theme=dark`.
5. **Check.** Run `npm run test:classes -w @pump/ui` until it passes. After a
   fix, `npm run test:classes:update -w @pump/ui` lowers the allow-list; a new
   violation gets fixed, never listed. If you changed a token in `index.css`,
   update `DESIGN.md` in the same change and run
   `node scripts/check-design-tokens.mjs`.

Done when the class guard and token guard pass and the page has one primary
action, red and amber only on problems, nothing under 12px (table headers
excepted), mono figures, and drawers for create/edit.

## Reviewing UI

Check the change against DESIGN.md "Do's and Don'ts" and "Page Patterns" and
the pump-ds README rules. Report each finding with `file:line`, the rule it
breaks, and the module or token that fixes it.
