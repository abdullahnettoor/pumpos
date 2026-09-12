Type: task
Status: open
Blocked by: 01-finalize-dssr-only-on-day-close

## Task

Enforce an authoritative closed-Business-Day write barrier across all date-anchored and optional-Shift financial and operational mutations.

## Acceptance Criteria

- Existing closed Business Days are rejected by the shared write-resolution path.
- Collections, credit sales, expenses, income, purchases, supplier payments, opening balances, product opening stock, and stock counts cannot write to a closed day.
- Lifecycle validation occurs under the shared Station/Business Day lock order.
- Failed writes persist neither records nor Business Events.
- Table-driven core tests cover every caller of the shared resolver.
