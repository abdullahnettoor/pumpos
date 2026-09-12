Type: task
Status: open
Blocked by: none

## Task

Keep Shift Summary date context current across Station day-start boundaries and make `Open next Shift` wait for authoritative Shift status.

## Acceptance Criteria

- Shift Summary uses the shared periodically refreshed Station Business Date hook.
- Historical context updates while the view remains mounted across day start.
- Shift close exposes an awaitable authoritative refresh path.
- `Open next Shift` never renders the cached, already-closed Shift as active.
- The selected historical Shift Business Date remains retained.
- Fake-clock and query-integration tests cover both regressions.
