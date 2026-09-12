## Problem Statement

Business Day and Shift closure create immutable reporting snapshots, but several write paths do not consistently enforce those lifecycle boundaries. An open-day DSSR may be persisted before final activity, financial records may be added after Business Day closure, a Shift may be reopened after its Business Day closes, and handover data may change after Shift closure. These paths can make immutable Shift Summaries and DSSR Snapshots disagree with their source records.

The one-open-Shift database constraint also needs a deployment-safe preflight for existing data. Two smaller UI lifecycle issues remain around Station day-start rollover and the `Open next Shift` transition.

## Solution

Create one authoritative lifecycle policy in core for Business Day and Shift writes. Every mutation that targets a Business Day or Shift must lock and validate its parent lifecycle before writing. Final DSSR generation occurs only as part of Business Day close; live/open-day reporting remains an unpersisted preview. Reopening and handover mutations must preserve snapshot integrity.

Ship the one-open-Shift constraint with an explicit duplicate-data preflight and remediation procedure. Correct the remaining UI date rollover and cache-transition behavior without changing the domain model or adding operational timestamp fields.

## User Stories

1. As an owner, I want a closed Business Day's DSSR to represent all final activity, so that historical reports are trustworthy.
2. As a manager, I want open-day reports to remain provisional and unpersisted, so that later activity cannot be omitted from the final DSSR.
3. As an operator, I want a clear error when attempting to write to a closed Business Day, so that I do not believe an invalid transaction was accepted.
4. As an accountant, I want collections, expenses, income, purchases, supplier payments, credit sales, opening balances, and stock counts blocked after day close, so that source records remain consistent with the DSSR.
5. As a manager, I want Shift reopening blocked after its parent Business Day closes, so that an immutable DSSR never depends on a deleted or replaced Shift Summary.
6. As an attendant, I want handovers accepted only while the Shift is open, so that finalized Shift accountability cannot change silently.
7. As an operator, I want nozzle readings accepted only while the Shift is open, so that finalized fuel sales cannot change after summary generation.
8. As an owner, I want handover replacement, terminal entries, nozzle updates, and its business event committed atomically, so that partial handovers cannot exist.
9. As a deployer, I want duplicate open Shifts detected before adding the unique index, so that migration failure is actionable and does not silently discard operational records.
10. As office staff, I want Shift Summary historical context to update at the Station day-start boundary, so that the displayed Current Business Date remains truthful.
11. As an operator, I want `Open next Shift` to wait for authoritative Shift status, so that the closed Shift is not briefly shown as active.
12. As an auditor, I want lifecycle rejections and successful corrective actions represented by Business Events, so that changes remain traceable.

## Implementation Decisions

- Treat findings 1 through 4 as merge-blocking data-integrity work.
- Persist DSSR Snapshots only for closed Business Days. `/dssr/daily/generate` must reject open Business Days; open-day views continue to use the non-persisted preview endpoint.
- Keep DSSR Snapshot regeneration explicit and immutable. If regeneration remains supported, define an append-only revision or auditable replacement policy rather than silently deleting/replacing a snapshot.
- Change the shared Business Day resolution helper used by write use cases to reject an existing closed Business Day. Audit every caller, including collections, credit sales, expenses, income, purchases, supplier payments, customer/supplier opening balances, product opening stock, and stock counts.
- Acquire locks in a consistent order for lifecycle-sensitive writes: Station, then Business Day, then Shift where needed. Re-check lifecycle state after acquiring locks.
- Reopen Shift must load and require an open parent Business Day, use the shared lock order, preserve the one-open-Shift invariant, and keep Shift Summary/DSSR consistency.
- Move handover recording behind a core use case. Require `OPEN` Shift status, validate authorization and assignments, update handover/terminal/nozzle records transactionally, and emit a Business Event.
- Do not allow handover or nozzle mutation for `CLOSED` or `LOCKED` Shifts. Corrections require the explicit reopen workflow.
- Add a migration preflight that reports duplicate open Shifts grouped by organization and Station. Do not auto-close or delete duplicates. Require an operator-selected remediation before applying the partial unique index.
- Document which migration runner is authoritative for production so equivalent Drizzle and Supabase migration files are not both applied to the same database.
- Replace direct `resolveBusinessDate` use in Shift Summary UI with the shared periodically refreshed Station clock hook.
- Make operational invalidation return an awaitable refresh path where immediate authoritative UI state is required. The close-success `Open next Shift` action must not expose cached active-Shift data.

## Testing Decisions

- Test DSSR generation at the core use-case seam: open Business Days are rejected, closed Business Days generate once, and explicit regeneration follows the chosen audit policy.
- Add table-driven core tests for every `ensureBusinessDayForDate` caller proving closed-day rejection and no writes/events on failure.
- Test Shift reopen against open and closed parent Business Days, including lock order and unchanged Shift Summary on rejection.
- Test handover recording through the highest available core/API seam: open Shift success, closed/locked rejection, rollback on terminal/nozzle failure, and event emission.
- Add a migration preflight test or scripted fixture that detects duplicate open Shifts and exits with actionable IDs without modifying data.
- Add a mounted UI test with a fake clock for Shift Summary rollover at the Station day-start boundary.
- Add an integration-level query test for close Shift followed immediately by `Open next Shift`, asserting that the stale active Shift workspace never reappears.
- Preserve existing one-open-Shift lock-order and partial-index coverage.

## Out of Scope

- Automatically deciding which duplicate open Shift should be closed during migration.
- New effective operational timestamp fields.
- Recalculating or silently mutating existing immutable snapshots.
- Mobile UI changes.
- Redesigning Business Day or Shift entities.

## Further Notes

- Source review: PR #13 follow-up at commit `df21d70`.
- Findings 1-8 were validated against the current implementation and are actionable.
- Recommended delivery order: snapshot-generation guard; closed-day write barrier; reopen invariant; transactional handover use case; migration preflight; UI rollover and refresh fixes.
- The existing Station lock and partial unique index correctly prevent new concurrent open Shifts once deployed; the migration preflight addresses legacy data only.
