Type: task
Status: open
Blocked by: none

## Task

Apply canonical, Station-clock-aware date eligibility to explicit Business Day opening.

## Acceptance Criteria

- Invalid Gregorian dates are rejected.
- Future Business Dates are rejected using the Station timezone and day-start boundary.
- Current and earlier valid Business Dates remain supported.
- Core tests cover impossible, future, current, and past dates.
