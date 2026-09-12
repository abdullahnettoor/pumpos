Type: task
Status: open
Blocked by: 02-enforce-closed-day-write-barrier

## Task

Move attendant handover recording into a transactional core use case and prohibit mutations after Shift closure.

## Acceptance Criteria

- Only `OPEN` Shifts accept handovers or handover-derived nozzle readings.
- `CLOSED` and `LOCKED` Shifts return an invariant error.
- Handover replacement, terminal entries, and nozzle updates commit atomically.
- Authorization and attendant/DU assignment checks remain enforced.
- A meaningful Business Event is emitted transactionally.
- Tests cover success, lifecycle rejection, authorization, and rollback on partial failure.
