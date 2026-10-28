# Report snapshots grow additively and are never backfilled

Status: accepted (2026-10-10).

The Shift Summary and the DSSR are immutable snapshots (AGENTS.md). The mobile
revamp (#388) needed figures the old snapshots didn't store: per-Shift fuel
value, credit-slip and Purchase counts, per-tank opening/closing/sold, Product
Sales lines with their category (`productType`), the payment split and the
nozzle's DU name. We **add new fields to snapshots composed from now on and
never rewrite or backfill old ones**. Every reader treats a missing field as
"not recorded" and falls back: it hides the figure, shows a single "Products"
line, or uses Book → Dip for tank movement. It never treats a missing field as
zero. We chose this over a backfill migration because a backfill would
recompute history from today's catalogue and settings, which is exactly what an
immutable snapshot exists to prevent. There is no snapshot version number; a
field's presence is the version.

## Consequences

- Old and new days can show different detail for the same screen. That is
  expected, not a bug.
- `RefreshShiftSummary` re-projects a Shift Summary from the live catalogue.
  Refreshing an old summary therefore fills in the new fields, and refreshing
  after a product's type is edited rewrites its category. This is the explicit,
  idempotent regeneration AGENTS.md allows, not a silent rewrite.
- `Fuel` sale rows are never counted as Product Sales in the DSSR, the
  Business Day list or the Shift Summary: fuel sales come only from Nozzle
  Readings. No client writes such rows today.
