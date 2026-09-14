Type: task
Status: open
Blocked by: none

## Task

Make deployment of the one-open-Shift partial unique index safe for databases that may contain duplicate open Shifts.

## Acceptance Criteria

- A preflight query lists duplicate `(organization_id, station_id)` groups and the affected Shift IDs.
- Migration stops with actionable guidance when duplicates exist.
- No migration automatically closes, locks, or deletes a Shift.
- The production migration runbook identifies the authoritative migration runner and avoids applying duplicate migration trees.
- The unique index is applied only after preflight passes and remains represented in the Drizzle schema.
