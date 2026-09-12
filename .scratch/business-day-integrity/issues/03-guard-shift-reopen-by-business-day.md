Type: task
Status: open
Blocked by: 01-finalize-dssr-only-on-day-close, 02-enforce-closed-day-write-barrier

## Task

Require the parent Business Day to remain open before reopening a Shift, while preserving Station-level one-open-Shift serialization and immutable report consistency.

## Acceptance Criteria

- Reopen acquires Station then Business Day locks before lifecycle checks.
- A Shift under a closed Business Day cannot reopen.
- Rejection leaves the Shift and Shift Summary unchanged.
- Successful reopen remains transactional with summary deletion, ledger reversal, and event publication.
- Core tests cover open-day success, closed-day rejection, another-open-Shift rejection, and lock ordering.
